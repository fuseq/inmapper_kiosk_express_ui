/**
 * Combined Three.js custom layer that renders every configured GLB model.
 *
 * Transform composition (point order, right→left):
 *   rotZ · rotY · rotX   → model "standing" orientation (rotation[])
 *   scale(s, -s, s)      → metres → mercator units (+ Y flip)
 *   yaw (about Z = up)   → heading; rotates around the vertical axis so the
 *                          model spins on its base instead of tipping over
 *   translate(origin)    → place at lng/lat/altitude
 *
 * `updateModelTransforms()` lets callers (the editor's placement tool)
 * re-position / re-scale / re-rotate models live, without reloading the
 * GLB — so dragging stays smooth.
 */

import { state } from '../../core/state.js';

function computeTransform(THREE, cfg) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(cfg.origin, cfg.altitude || 0);
    const meterScale = mc.meterInMercatorCoordinateUnits();
    const rot = cfg.rotation || [Math.PI / 2, 0, 0];

    const rotX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), rot[0]);
    const rotY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), rot[1]);
    const rotZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), rot[2]);
    // Heading: rotate about the vertical (mercator Z) axis, applied AFTER the
    // standing rotation so the model yaws on its base instead of tipping.
    const yaw  = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), cfg.heading || 0);
    const scale = meterScale * (cfg.scale || 1);

    return new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .multiply(yaw)
        .scale(new THREE.Vector3(scale, -scale, scale))
        .multiply(rotX).multiply(rotY).multiply(rotZ);
}

/* Google-hosted, CORS-enabled Draco decoder (no local files needed). Most
 * modern free GLBs ship Draco-compressed meshes, so wiring this in lets the
 * library load the vast majority of community models out of the box. */
const DRACO_DECODER_PATH = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/';

export function createCombinedModelLayer(THREE, GLTFLoader, models, DRACOLoader) {
    return {
        id: '3d-models-combined',
        type: 'custom',
        renderingMode: '3d',

        onAdd(map, gl) {
            this.camera = new THREE.Camera();
            this.map = map;
            this.modelEntries = [];

            this.renderer = new THREE.WebGLRenderer({
                canvas: map.getCanvas(),
                context: gl,
                antialias: true,
            });
            this.renderer.autoClear = false;

            const loader = new GLTFLoader();
            if (DRACOLoader) {
                try {
                    const draco = new DRACOLoader();
                    draco.setDecoderPath(DRACO_DECODER_PATH);
                    loader.setDRACOLoader(draco);
                    this.dracoLoader = draco;
                } catch (e) {
                    console.warn('⚠️ DRACOLoader setup failed; compressed models may not load:', e);
                }
            }
            for (const cfg of models) {
                const scene = new THREE.Scene();

                const dir1 = new THREE.DirectionalLight(0xffffff, 1.2);
                dir1.position.set(0, -70, 100).normalize();
                scene.add(dir1);

                const dir2 = new THREE.DirectionalLight(0xffffff, 0.8);
                dir2.position.set(0, 70, 100).normalize();
                scene.add(dir2);

                scene.add(new THREE.AmbientLight(0xffffff, 0.5));

                const entry = {
                    id: cfg.id,
                    floor: cfg.floor ?? null,
                    scene,
                    transformMatrix: computeTransform(THREE, cfg),
                    loaded: false,
                };
                this.modelEntries.push(entry);

                loader.load(
                    cfg.url,
                    (gltf) => {
                        // Re-anchor the mesh so it (a) spins on its own vertical
                        // axis when yawed and (b) sits *on the ground* at the
                        // requested altitude. We centre the footprint (local X/Z)
                        // over the origin and drop the base (min Y) to y=0.
                        try {
                            const box = new THREE.Box3().setFromObject(gltf.scene);
                            if (isFinite(box.min.y)) {
                                const c = box.getCenter(new THREE.Vector3());
                                gltf.scene.position.x -= c.x;
                                gltf.scene.position.z -= c.z;
                                gltf.scene.position.y -= box.min.y;
                            }
                        } catch (e) {
                            console.warn(`⚠️ Could not re-anchor model ${cfg.id}:`, e);
                        }
                        scene.add(gltf.scene);
                        entry.loaded = true;
                        console.log(`✅ 3D model loaded: ${cfg.id}`);
                        map.triggerRepaint();
                    },
                    undefined,
                    (err) => console.error(`❌ Failed to load 3D model ${cfg.id}:`, err),
                );
            }
        },

        /**
         * Live-update model transforms (origin / scale / rotation / heading)
         * without reloading the GLB. Matches entries by `id`; ignores models
         * that aren't currently loaded (caller should rebuild for add/remove).
         */
        updateModelTransforms(next) {
            if (!this.modelEntries) return;
            for (const cfg of (next || [])) {
                const e = this.modelEntries.find(x => x.id === cfg.id);
                if (!e) continue;
                e.transformMatrix = computeTransform(THREE, cfg);
                if ('floor' in cfg) e.floor = cfg.floor ?? null;
            }
            if (this.map) this.map.triggerRepaint();
        },

        render(gl, args) {
            this.renderer.resetState();

            /* Multi-floor: only render models whose floor matches the active
             * floor. `null`/'all' (or a model without a floor tag) shows on
             * every floor for back-compat. */
            const cf = state.currentFloor;
            const showAll = cf == null || cf === 'all';

            for (const entry of this.modelEntries) {
                if (!entry.loaded) continue;
                if (!showAll && entry.floor != null && String(entry.floor) !== String(cf)) continue;

                this.camera.projectionMatrix
                    .fromArray(args.defaultProjectionData.mainMatrix)
                    .multiply(entry.transformMatrix);

                this.renderer.render(entry.scene, this.camera);
            }

            this.map.triggerRepaint();
        },
    };
}
