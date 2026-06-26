/**
 * Routing test pane: a quick sanity check between two rooms — possibly
 * on different floors — using the production multi-floor pathfinder.
 *
 * Builds the graph from the *merged* geojson (every floor's features,
 * each tagged with `properties.floor`). Cross-floor portals (named
 * `Elev.{stack}.{targetFloor}` / `Stairs.{stack}.{targetFloor}`) are
 * stitched together by the pathfinder, so picking a unit on floor 0 and
 * one on floor 2 produces a multi-segment route with explicit
 * `Elev/Stairs` transition cards in the bar.
 */

import { mbState } from './state.js';
import { loadMapBuilderCdns } from './shell.js';
import { buildColorExpr } from './process.js';
import { buildGraph, findRoute } from '../../features/map/pathfinder.js';

let routingMap = null;
let startId = null;
let endId = null;
let lastRoute = null;

export async function initRoutingTest(app) {
    const $empty   = document.getElementById('mbRoutingEmpty');
    const $mapHost = document.getElementById('mbRoutingMap');
    const $bar     = document.getElementById('mbRoutingBar');
    const $labelS  = document.getElementById('mbLabelStart');
    const $labelE  = document.getElementById('mbLabelEnd');
    const $clear   = document.getElementById('mbClearRoute');

    const host = document.getElementById('edMapBuilder');
    host.addEventListener('mb:tab', async (e) => {
        if (e.detail.tab === 'routing') await ensure();
    });

    mbState.on('active-floor-changed', () => {
        if (routingMap) {
            applyFloorFilters();
            startId = null; endId = null; lastRoute = null;
            $labelS.textContent = 'Bir oda seç';
            $labelE.textContent = 'Bir oda seç';
            clearRouteLine();
            renderTransitions();
        }
    });

    mbState.on('geojson-changed', () => {
        if (routingMap) {
            refreshSources();
            buildGraph(mergedGeojson());
        }
    });

    async function ensure() {
        const merged = mergedGeojson();
        if (!merged.features.length) {
            $empty.hidden = false; $mapHost.hidden = true; $bar.hidden = true;
            return;
        }
        await loadMapBuilderCdns();
        if (!routingMap) {
            $empty.hidden = true; $mapHost.hidden = false; $bar.hidden = false;
            routingMap = new window.maplibregl.Map({
                container: $mapHost,
                style: {
                    version: 8, sources: {},
                    layers: [{ id: 'bg', type: 'background',
                              paint: { 'background-color': '#f0f0f0' } }],
                },
                center: [mbState.centerLng, mbState.centerLat],
                zoom: 17,
            });
            routingMap.addControl(new window.maplibregl.NavigationControl());
            await new Promise(r => routingMap.once('load', r));
            installLayers();
            attachClick();
        } else {
            requestAnimationFrame(() => routingMap.resize());
            refreshSources();
        }
        applyFloorFilters();
        buildGraph(mergedGeojson());
    }

    function mergedGeojson() {
        return mbState.buildMergedGeojson();
    }

    function installLayers() {
        const merged = mergedGeojson();
        const rooms = { type: 'FeatureCollection',
            features: merged.features.filter(f => f.properties.layer === 'rooms') };
        const paths = { type: 'FeatureCollection',
            features: merged.features.filter(f => f.properties.layer === 'paths') };

        if (!routingMap.getSource('routing-rooms')) {
            routingMap.addSource('routing-rooms', { type: 'geojson', data: rooms });
            routingMap.addLayer({
                id: 'routing-rooms-fill', type: 'fill', source: 'routing-rooms',
                paint: { 'fill-color': buildColorExpr(), 'fill-opacity': 0.7, 'fill-outline-color': '#666' },
            });
            // Ghost outline of other floors (drawn under the active fill).
            routingMap.addLayer({
                id: 'routing-rooms-ghost', type: 'line', source: 'routing-rooms',
                paint: {
                    'line-color': '#94a3b8', 'line-width': 1, 'line-opacity': 0.6,
                    'line-dasharray': [3, 3],
                },
            }, 'routing-rooms-fill');
        }
        if (!routingMap.getSource('routing-paths')) {
            routingMap.addSource('routing-paths', { type: 'geojson', data: paths });
            routingMap.addLayer({
                id: 'routing-paths-line', type: 'line', source: 'routing-paths',
                paint: { 'line-color': '#3fab35', 'line-width': 1.5, 'line-opacity': 0.6 },
            });
        }
        if (!routingMap.getSource('routing-route')) {
            routingMap.addSource('routing-route', {
                type: 'geojson', data: { type: 'FeatureCollection', features: [] },
            });
            routingMap.addLayer({
                id: 'routing-route-line', type: 'line', source: 'routing-route',
                paint: { 'line-color': '#dc2626', 'line-width': 4 },
            });
        }
        const bounds = new window.maplibregl.LngLatBounds();
        for (const f of merged.features) {
            const g = f.geometry;
            if (g?.type === 'Polygon') g.coordinates[0].forEach(c => bounds.extend(c));
            else if (g?.type === 'MultiPolygon') g.coordinates.forEach(p => p[0]?.forEach(c => bounds.extend(c)));
        }
        if (!bounds.isEmpty()) routingMap.fitBounds(bounds, { padding: 40, animate: false });
    }

    function refreshSources() {
        const merged = mergedGeojson();
        routingMap.getSource('routing-rooms')?.setData({
            type: 'FeatureCollection',
            features: merged.features.filter(f => f.properties.layer === 'rooms'),
        });
        routingMap.getSource('routing-paths')?.setData({
            type: 'FeatureCollection',
            features: merged.features.filter(f => f.properties.layer === 'paths'),
        });
    }

    function applyFloorFilters() {
        if (!routingMap) return;
        const active = mbState.activeFloorKey || '0';
        // Active floor → solid fill; other floors → ghost outline only.
        if (routingMap.getLayer('routing-rooms-fill')) {
            routingMap.setFilter('routing-rooms-fill',
                ['==', ['coalesce', ['to-string', ['get', 'floor']], '0'], String(active)]);
        }
        if (routingMap.getLayer('routing-rooms-ghost')) {
            routingMap.setFilter('routing-rooms-ghost',
                ['!=', ['coalesce', ['to-string', ['get', 'floor']], '0'], String(active)]);
        }
        if (routingMap.getLayer('routing-paths-line')) {
            routingMap.setFilter('routing-paths-line',
                ['==', ['coalesce', ['to-string', ['get', 'floor']], '0'], String(active)]);
        }
    }

    function attachClick() {
        routingMap.on('click', 'routing-rooms-fill', (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const id = f.properties.id;
            const floor = f.properties.floor || '0';
            const label = `${id} · Kat ${floor}`;
            if (!startId) {
                startId = id;
                $labelS.textContent = label;
            } else if (!endId) {
                endId = id;
                $labelE.textContent = label;
                tryRoute();
            } else {
                startId = id; endId = null;
                $labelS.textContent = label;
                $labelE.textContent = 'Bir oda seç';
                clearRouteLine();
                lastRoute = null;
                renderTransitions();
            }
        });
    }

    function tryRoute() {
        if (!startId || !endId) return;
        const route = findRoute(startId, endId);
        if (!route) {
            app.setStatus('Rota bulunamadı', 'dirty');
            lastRoute = null;
            renderTransitions();
            return;
        }
        lastRoute = route;
        const fc = { type: 'FeatureCollection', features: [{
            type: 'Feature', properties: {},
            geometry: { type: 'LineString', coordinates: route.coordinates },
        }] };
        routingMap.getSource('routing-route').setData(fc);
        const xfNote = route.transitions?.length
            ? ` · ${route.transitions.length} kat geçişi` : '';
        app.setStatus(`Rota: ${route.distance.toFixed(1)}m${xfNote}`, 'saved');
        renderTransitions();
    }

    function clearRouteLine() {
        routingMap.getSource('routing-route')?.setData({ type: 'FeatureCollection', features: [] });
    }

    function renderTransitions() {
        // Append a tiny per-segment summary inside the routing bar so the
        // user can see the floor changes without leaving the test pane.
        const $existing = $bar.querySelector('.ed-mb-routing-segments');
        if ($existing) $existing.remove();
        if (!lastRoute || !lastRoute.segments?.length) return;
        const div = document.createElement('div');
        div.className = 'ed-mb-routing-segments';
        const parts = [];
        lastRoute.segments.forEach((s, i) => {
            const f = mbState.getFloor(s.floor);
            const name = f?.name || `Kat ${s.floor}`;
            parts.push(`<span class="ed-mb-rseg">${escapeHtml(name)}</span>`);
            const t = lastRoute.transitions[i];
            if (t) {
                const tName = t.type === 'Elev' ? `Asansör #${t.stack}` : `Merdiven #${t.stack}`;
                parts.push(`<span class="ed-mb-rtrans">${tName} →</span>`);
            }
        });
        div.innerHTML = parts.join('');
        $bar.appendChild(div);
    }

    $clear.addEventListener('click', () => {
        startId = null; endId = null; lastRoute = null;
        $labelS.textContent = 'Bir oda seç';
        $labelE.textContent = 'Bir oda seç';
        clearRouteLine();
        renderTransitions();
    });
}

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
