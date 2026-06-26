/**
 * "Birim Görünümü" pane: choose how units are raised on the map —
 * solid blocks (default) or Pointr-style perimeter walls — plus the wall
 * thickness and wall colour source. These are *global* (per-venue) settings,
 * written straight to the config overrides like other map options.
 *
 * Lives next to the 3D Heights pane because it edits the same `rooms-3d`
 * extrusion. Changes apply live to the processed map (refreshProcessedRooms)
 * and queue an iframe-preview reload so both views stay WYSIWYG.
 */

import { mbState } from './state.js';
import { refreshProcessedRooms } from './process.js';

/* Slider integer (2..30) ↔ metres (0.2..3.0). */
const toMeters = (v) => v / 10;
const toSlider = (m) => Math.round((m ?? 0.6) * 10);

/* Wall-gap slider (0..20) ↔ metres (0.00..1.00, 0.05 steps). */
const gapToMeters = (v) => v / 20;
const gapToSlider = (m) => Math.round((m ?? 0.15) * 20);

export function initRenderMode(app) {
    const $section   = document.getElementById('mbSection-render');
    const $modeBtns  = [...document.querySelectorAll('#mbSection-render [data-rendermode]')];
    const $wallOpts  = document.getElementById('mbWallOpts');
    const $thick     = document.getElementById('mbWallThick');
    const $thickVal  = document.getElementById('mbWallThickVal');
    const $gap       = document.getElementById('mbWallGap');
    const $gapValM   = document.getElementById('mbWallGapVal');
    const $colorBtns = [...document.querySelectorAll('#mbSection-render [data-wallcolor]')];
    const $colorRow  = document.getElementById('mbWallColorRow');
    const $color     = document.getElementById('mbWallColor');
    const $gapBtns   = [...document.querySelectorAll('#mbSection-render [data-doorgap]')];
    const $gapRow    = document.getElementById('mbDoorGapRow');
    const $gapWidth  = document.getElementById('mbDoorGapWidth');
    const $gapVal    = document.getElementById('mbDoorGapVal');
    const $gapModeBtns = [...document.querySelectorAll('#mbSection-render [data-doorgapmode]')];
    const $gapModeToggle = document.getElementById('mbDoorGapModeToggle');
    if (!$section) return;

    const mapCfg = () => app?.getConfig?.()?.features?.map || {};

    function apply(path, value) {
        app?.setOverride?.(`features.map.${path}`, value);
        refreshProcessedRooms();
        app?.reload?.([`features.map.${path}`]);
    }

    function syncUi() {
        const cfg = mapCfg();
        const mode = cfg.roomRenderMode || 'solid';
        const wallColorMode = cfg.wallColorMode || 'unit';

        $modeBtns.forEach(b => b.classList.toggle('is-active', b.dataset.rendermode === mode));
        $wallOpts.hidden = mode !== 'walls';

        const sv = toSlider(cfg.wallThickness ?? 0.6);
        $thick.value = String(sv);
        $thickVal.textContent = toMeters(sv).toFixed(1) + ' m';

        if ($gap) {
            const gpv = gapToSlider(cfg.wallGap ?? 0.15);
            $gap.value = String(gpv);
            if ($gapValM) $gapValM.textContent = gapToMeters(gpv).toFixed(2) + ' m';
        }

        $colorBtns.forEach(b => b.classList.toggle('is-active', b.dataset.wallcolor === wallColorMode));
        $colorRow.hidden = wallColorMode !== 'fixed';
        if (cfg.wallColor) $color.value = cfg.wallColor;

        const gapsOn = cfg.doorGaps !== false;   // default ON
        $gapBtns.forEach(b => b.classList.toggle('is-active', b.dataset.doorgap === (gapsOn ? 'on' : 'off')));
        if ($gapRow) $gapRow.hidden = !gapsOn;
        const gv = toSlider(cfg.doorGapWidth ?? 1.2);
        if ($gapWidth) $gapWidth.value = String(gv);
        if ($gapVal) $gapVal.textContent = toMeters(gv).toFixed(1) + ' m';

        const gapMode = cfg.doorGapMode || 'doors';
        $gapModeBtns.forEach(b => b.classList.toggle('is-active', b.dataset.doorgapmode === gapMode));
        // Opening method only matters when door gaps are enabled.
        if ($gapModeToggle) $gapModeToggle.hidden = !gapsOn;
    }

    $modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            apply('roomRenderMode', btn.dataset.rendermode);
            syncUi();
        });
    });

    $thick.addEventListener('input', () => {
        const m = toMeters(Number($thick.value));
        $thickVal.textContent = m.toFixed(1) + ' m';
        apply('wallThickness', m);
    });

    if ($gap) {
        $gap.addEventListener('input', () => {
            const m = gapToMeters(Number($gap.value));
            if ($gapValM) $gapValM.textContent = m.toFixed(2) + ' m';
            apply('wallGap', m);
        });
    }

    $colorBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            apply('wallColorMode', btn.dataset.wallcolor);
            syncUi();
        });
    });

    $color.addEventListener('input', () => apply('wallColor', $color.value));

    $gapBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            apply('doorGaps', btn.dataset.doorgap === 'on');
            syncUi();
        });
    });

    if ($gapWidth) {
        $gapWidth.addEventListener('input', () => {
            const m = toMeters(Number($gapWidth.value));
            if ($gapVal) $gapVal.textContent = m.toFixed(1) + ' m';
            apply('doorGapWidth', m);
        });
    }

    $gapModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            apply('doorGapMode', btn.dataset.doorgapmode);
            syncUi();
        });
    });

    function showSection() {
        $section.hidden = !mbState.geojson;
        if (mbState.geojson) syncUi();
    }

    mbState.on('hydrate', showSection);
    mbState.on('geojson-changed', showSection);
    mbState.on('active-floor-changed', showSection);
    mbState.on('processed-map-ready', () => { if (mbState.geojson) refreshProcessedRooms(); });
    mbState.on('processed-map-rendered', () => { if (mbState.geojson) syncUi(); });

    showSection();
}
