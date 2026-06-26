# @inmapper/route-engine

Standalone, dependency-free indoor **routing engine**. Given a venue's floor
SVGs it computes routes between two units and returns metric, step-by-step
directions. Runs in the browser and in Node (zero dependencies, ESM).

It is a faithful *core* port of the inMapper routing backend
(`shortest` / `least_turns`) plus a new **accessible** mode that prefers
elevator-only floor transitions for wheelchair users.

> Scope: this produces **metric** directions (distance + landmark + side).
> The human/natural-language description model is a separate service and is not
> part of this package.

## Install / use

```js
import { createVenue, computeRoute, computeRoutes } from '@inmapper/route-engine';

// 1. Build the venue once from its floor SVGs (same inMapper SVG schema:
//    groups Rooms / Paths / Doors / Portals).
const venue = createVenue({
  floors: [
    { name: 'Kat 0',  svgText: floor0Svg },
    { name: 'Kat -1', svgText: floorMinus1Svg },
  ],
  pixelToMeter: 0.1,        // SVG px -> meters (venue specific)
  portalStatuses: [],       // optional: [{ id, layerId, Status }]
});

// 2. Compute a single route.
const route = computeRoute(venue, {
  startFloor: 'Kat 0', startId: 'ID013',
  endFloor:   'Kat 0', endId:   'ID005',
  routeType:  'shortest',           // 'shortest' | 'least_turns' | 'accessible'
});

// 3. Or compute several types at once.
const routes = computeRoutes(venue, {
  startFloor: 'Kat 0', startId: 'ID013',
  endFloor:   'Kat -1', endId:  'ID042',
}, ['shortest', 'least_turns', 'accessible']);
```

## Route types

| type          | optimises        | floor transitions      |
| ------------- | ---------------- | ---------------------- |
| `shortest`    | walking distance | any portal (Elev/Stairs) |
| `least_turns` | number of turns  | any portal             |
| `accessible`  | distance         | **elevator only** (`Elev.*`) |

## Output shape

```jsonc
{
  "routeType": "shortest",
  "isMultiFloor": false,
  "routeId": "Kat 0_Shop_ID013_to_Kat 0_Shop_ID005",
  "summary": {
    "total_distance_meters": 42.3,
    "turns_count": 3,
    "estimated_time_minutes": 0.5,
    "floor_changes": 0
  },
  "path": {
    "connection_ids": ["ID013_1_", "p12", "p13", "ID005_1_"],
    "points": [[x, y], ...],
    "by_floor": [{ "floor": "Kat 0", "connection_ids": [...], "points": [...] }]
  },
  "steps": [
    { "step_number": 1, "action": "START", "distance_meters": 4.1,
      "cumulative_distance": 0, "description": "...", "landmark": null,
      "direction": "sag", "path_index": 0 },
    // TURN_LEFT | TURN_RIGHT | PASS_BY | FLOOR_CHANGE | ARRIVE ...
  ],
  "turns": [ ... ],
  "segments": [ ... ],   // multi-floor only
  "transitions": [ ... ] // floor changes
}
```

## SVG schema

Floor SVGs must use the inMapper group convention (matched by `id` or
`inkscape:label`):

- `Rooms` -> sub-groups by type (`Shop`, `Food`, `Other`, `Stand`, ...), each
  child `<path>` is a unit polygon whose `id` is the unit id (e.g. `ID013`).
- `Paths` -> corridor segments (`<line>` or 2-point `<path>`).
- `Doors` -> door segments; a unit's door id starts with `"<unitId>_"`.
- `Portals` -> floor-change portals; id format `Elev.<no>.<targetFloor>` or
  `Stairs.<no>.<targetFloor>`. `Stop.<no>.<hall>` segments model same-floor
  hall jumps.

## License

MIT
