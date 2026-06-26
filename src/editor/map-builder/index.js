/**
 * Map Builder tab (entry).
 *
 * Drives the SVG → GeoJSON → align → POI placement workflow.
 * The whole sub-feature is mounted lazily: heavy CDN libs (MapLibre,
 * svg-pan-zoom) are only fetched the first time the user opens the
 * Harita tab.
 */

import { renderShell } from './shell.js';
import { initFloors } from './floors.js';
import { initUpload } from './upload.js';
import { initProcess } from './process.js';
import { initHeights } from './heights.js';
import { initRenderMode } from './render-mode.js';
import { initLabels } from './labels.js';
import { initIcons } from './icons.js';
import { initAlign } from './align.js';
import { initRoutingTest } from './routing-test.js';
import { initDataSource } from './data-source.js';
import { initGeometryEdit } from './geometry-edit.js';
import { initModels } from './models.js';
import { mbState } from './state.js';

export function initMapBuilder(host, app) {
    let started = false;

    async function activate() {
        if (started) return;
        started = true;
        await renderShell(host);
        mbState.host = app;

        initDataSource(app);
        await initFloors(app);
        await initUpload(app);
        await initProcess(app);
        await initHeights(app);
        initRenderMode(app);
        await initLabels(app);
        await initIcons(app);
        await initAlign(app);
        await initRoutingTest(app);
        initGeometryEdit(app);
        await initModels(app);

        // Reflect active floor name in the section header tag.
        const $tag = document.getElementById('mbActiveFloorTag');
        const updateTag = () => {
            if (!$tag) return;
            const f = mbState.getActiveFloor();
            $tag.textContent = f ? `· ${f.name}` : '';
        };
        mbState.on('hydrate', updateTag);
        mbState.on('active-floor-changed', updateTag);
        mbState.on('floors-changed', updateTag);

        await mbState.hydrate();
    }

    return { activate };
}
