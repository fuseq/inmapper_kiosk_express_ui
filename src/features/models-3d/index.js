import { config } from '../../core/config.js';
import { eventBus } from '../../core/event-bus.js';
import { createCombinedModelLayer } from './model-loader.js';
import { mapRenderer } from '../map/map-renderer.js';

let combinedLayer = null;

function sameModelSet(models) {
    const ids = (combinedLayer?.modelEntries || []).map(e => e.id).sort();
    const next = models.map(m => m.id).sort();
    return ids.length === next.length && ids.every((id, i) => id === next[i]);
}

async function addModelsToMap(map, { rebuild = false } = {}) {
    try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { DRACOLoader } = await import('three/addons/loaders/DRACOLoader.js');

        const models = config.features.models3d.models || [];

        // Live edit with the same set of models → update transforms in place
        // (no GLB reload), so dragging in the editor stays smooth.
        if (rebuild && combinedLayer?.updateModelTransforms && map.getLayer('3d-models-combined') && sameModelSet(models)) {
            combinedLayer.updateModelTransforms(models);
            return;
        }

        // Structural change (add/remove) → drop and rebuild the layer.
        if (rebuild && map.getLayer('3d-models-combined')) {
            map.removeLayer('3d-models-combined');
            combinedLayer = null;
        }
        if (!models.length) return;
        if (map.getLayer('3d-models-combined')) return;

        const layer = createCombinedModelLayer(THREE, GLTFLoader, models, DRACOLoader);
        map.addLayer(layer);
        combinedLayer = layer;
        console.log(`✅ Combined 3D model layer added (${models.length} model(s))`);
    } catch (err) {
        console.error('❌ Failed to add 3D models:', err);
    }
}

export async function init() {
    const map = mapRenderer.mainMap;
    if (!map) {
        console.warn('⚠️ models3d: mainMap not available');
        return;
    }

    await addModelsToMap(map);

    /* Editor live placement / toggle: rebuild the layer whenever the
     * placement list changes or the feature is toggled (preview-bridge
     * emits this on editor:setModels and the models3d.enabled toggle). */
    eventBus.on('models3d:reapply', () => {
        const m = mapRenderer.mainMap;
        if (!m || m._removed) return;
        if (config.features.models3d?.enabled === false) {
            if (m.getLayer('3d-models-combined')) m.removeLayer('3d-models-combined');
            return;
        }
        addModelsToMap(m, { rebuild: true });
    });

    /* Per-floor visibility is decided in the layer's render() from
     * state.currentFloor; nudge a repaint so a floor switch reflects at once. */
    eventBus.on('floor:changed', () => {
        const m = mapRenderer.mainMap;
        if (m && !m._removed) m.triggerRepaint();
    });
}

export function destroy() {
    const map = mapRenderer.mainMap;
    combinedLayer = null;
    if (!map || map._removed) return;
    if (map.getLayer('3d-models-combined')) map.removeLayer('3d-models-combined');
}
