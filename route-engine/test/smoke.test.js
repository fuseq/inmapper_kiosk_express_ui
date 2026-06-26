/**
 * Smoke tests for @inmapper/route-engine (run: `node test/smoke.test.js`).
 *
 * Uses tiny synthetic SVG fixtures (same group schema as real venues) to
 * exercise: SVG parse -> graph -> dijkstra (distance/turns) -> path points ->
 * turn detection -> metric steps, plus multi-floor + accessible handling.
 */

import assert from 'node:assert';
import { createVenue, computeRoute, computeRoutes } from '../src/index.js';

let passed = 0;
function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok  - ${name}`);
    } catch (err) {
        console.error(`  FAIL- ${name}`);
        console.error('       ' + (err.stack || err.message));
        process.exitCode = 1;
    }
}

/* ---- fixtures ---------------------------------------------------------- */

// Floor 0: rooms ID001 (A) and ID002 (B) joined by an L-shaped corridor that
// turns right at (100,0). An elevator (Elev.1) branches off at (150,100).
const FLOOR0 = `
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape">
  <g id="Rooms">
    <g id="Shop">
      <path id="ID001" d="M -20,-30 L 20,-30 L 20,-10 L -20,-10 Z"/>
      <path id="ID002" d="M 80,110 L 120,110 L 120,150 L 80,150 Z"/>
    </g>
  </g>
  <g id="Paths">
    <path id="p1" d="M 0,0 L 100,0"/>
    <path id="p2" d="M 100,0 L 100,100"/>
    <path id="p3" d="M 100,100 L 150,100"/>
  </g>
  <g id="Doors">
    <path id="ID001_1_" d="M 0,-10 L 0,0"/>
    <path id="ID002_1_" d="M 100,100 L 100,110"/>
  </g>
  <g id="Portals">
    <path id="Elev.1.Kat 1" d="M 150,100 L 150,90"/>
  </g>
</svg>`;

// Floor 1: elevator arrival -> corridor -> room ID101.
const FLOOR1 = `
<svg xmlns="http://www.w3.org/2000/svg">
  <g inkscape:label="Rooms">
    <g inkscape:label="Shop">
      <path id="ID101" d="M 60,10 L 100,10 L 100,50 L 60,50 Z"/>
    </g>
  </g>
  <g id="Paths">
    <path id="p1f1" d="M 0,0 L 80,0"/>
  </g>
  <g id="Doors">
    <path id="ID101_1_" d="M 80,0 L 80,10"/>
  </g>
  <g id="Portals">
    <path id="Elev.1.Kat 0" d="M 0,0 L 0,10"/>
  </g>
</svg>`;

// Stairs-only venue (for accessible failure assertion).
const S0 = `
<svg xmlns="http://www.w3.org/2000/svg">
  <g id="Rooms"><g id="Shop"><path id="ID001" d="M -20,-30 L 20,-30 L 20,-10 L -20,-10 Z"/></g></g>
  <g id="Paths"><path id="p1" d="M 0,0 L 60,0"/></g>
  <g id="Doors"><path id="ID001_1_" d="M 0,-10 L 0,0"/></g>
  <g id="Portals"><path id="Stairs.1.B" d="M 60,0 L 60,10"/></g>
</svg>`;
const S1 = `
<svg xmlns="http://www.w3.org/2000/svg">
  <g id="Rooms"><g id="Shop"><path id="ID201" d="M 60,10 L 100,10 L 100,50 L 60,50 Z"/></g></g>
  <g id="Paths"><path id="p1" d="M 0,0 L 80,0"/></g>
  <g id="Doors"><path id="ID201_1_" d="M 80,0 L 80,10"/></g>
  <g id="Portals"><path id="Stairs.1.A" d="M 0,0 L 0,10"/></g>
</svg>`;

/* ---- tests ------------------------------------------------------------- */

const venue = createVenue({
    floors: [
        { name: 'Kat 0', svgText: FLOOR0 },
        { name: 'Kat 1', svgText: FLOOR1 },
    ],
    pixelToMeter: 0.1,
});

test('venue parses floors, rooms and portals', () => {
    assert.equal(venue.floors.length, 2);
    const f0 = venue.floorByName.get('Kat 0');
    assert.ok(f0.roomsById.get('ID001'), 'ID001 room parsed');
    assert.ok(f0.roomsById.get('ID002'), 'ID002 room parsed');
    assert.equal(f0.roomsById.get('ID001').type, 'Shop');
    assert.equal(f0.portals.length, 1, 'one Elev portal on floor 0');
    assert.equal(f0.portals[0].parsed.type, 'Elev');
    assert.equal(f0.portals[0].parsed.targetFloor, 'Kat 1');
    // inkscape:label group on floor 1 resolves too
    assert.ok(venue.floorByName.get('Kat 1').roomsById.get('ID101'));
});

test('shortest same-floor route ID001 -> ID002', () => {
    const r = computeRoute(venue, {
        startFloor: 'Kat 0', startId: 'ID001',
        endFloor: 'Kat 0', endId: 'ID002',
        routeType: 'shortest',
    });
    assert.equal(r.isMultiFloor, false);
    assert.ok(r.path.points.length >= 3, 'has path points');
    assert.ok(r.summary.total_distance_meters > 0, 'positive distance');
    assert.equal(r.steps[0].action, 'START');
    assert.equal(r.steps[r.steps.length - 1].action, 'ARRIVE');
    const hasTurn = r.steps.some(s => s.action === 'TURN_RIGHT' || s.action === 'TURN_LEFT');
    assert.ok(hasTurn, 'detects the corridor turn');
});

test('least_turns route is computed', () => {
    const r = computeRoute(venue, {
        startFloor: 'Kat 0', startId: 'ID001',
        endFloor: 'Kat 0', endId: 'ID002',
        routeType: 'least_turns',
    });
    assert.ok(r.path.points.length >= 3);
    assert.ok(r.summary.turns_count >= 1);
});

test('multi-floor route ID001 (Kat 0) -> ID101 (Kat 1) via elevator', () => {
    const r = computeRoute(venue, {
        startFloor: 'Kat 0', startId: 'ID001',
        endFloor: 'Kat 1', endId: 'ID101',
        routeType: 'shortest',
    });
    assert.equal(r.isMultiFloor, true);
    assert.equal(r.transitions.length, 1);
    assert.equal(r.transitions[0].type, 'Elev');
    const fc = r.steps.find(s => s.action === 'FLOOR_CHANGE');
    assert.ok(fc, 'has a FLOOR_CHANGE step');
    assert.equal(r.path.by_floor.length, 2, 'two floor segments');
    assert.equal(r.summary.floor_changes, 1);
});

test('accessible route uses elevator when available', () => {
    const r = computeRoute(venue, {
        startFloor: 'Kat 0', startId: 'ID001',
        endFloor: 'Kat 1', endId: 'ID101',
        routeType: 'accessible',
    });
    assert.equal(r.isMultiFloor, true);
    assert.equal(r.transitions[0].type, 'Elev');
});

test('accessible route fails when only stairs connect floors', () => {
    const stairsVenue = createVenue({
        floors: [
            { name: 'A', svgText: S0 },
            { name: 'B', svgText: S1 },
        ],
        pixelToMeter: 0.1,
    });
    const routes = computeRoutes(stairsVenue, {
        startFloor: 'A', startId: 'ID001',
        endFloor: 'B', endId: 'ID201',
    }, ['shortest', 'accessible']);
    assert.ok(!routes.shortest.error, 'shortest works via stairs');
    assert.equal(routes.shortest.isMultiFloor, true);
    assert.ok(routes.accessible.error, 'accessible reports no elevator');
});

test('computeRoutes returns a map of types', () => {
    const routes = computeRoutes(venue, {
        startFloor: 'Kat 0', startId: 'ID001',
        endFloor: 'Kat 0', endId: 'ID002',
    });
    assert.ok(routes.shortest && routes.least_turns && routes.accessible);
    assert.ok(!routes.shortest.error);
});

console.log(`\n${passed} test(s) passed.`);
