/**
 * Editor <-> preview iframe postMessage bridge.
 *
 * Messages sent to preview:
 *   { type: 'editor:hello' }                                      handshake
 *   { type: 'editor:setMany', changes: [{path,value,meta?}] }     config diff
 *   { type: 'editor:goToScene', sceneId, commands: [...] }        drive scene
 *   { type: 'editor:highlight', selectors, label? }               spotlight DOM
 *   { type: 'editor:clearHighlight' }                             clear spotlight
 *
 * Messages received from preview:
 *   { type: 'preview:ready' [, phase] }         ready to receive
 *   { type: 'preview:applied', path, value }    hot apply succeeded
 *   { type: 'preview:reloadRequired', paths }   need iframe reload
 *   { type: 'preview:highlight:missed', selectors }
 */

export function createBridge(iframe) {
    let ready = false;
    const pending = [];
    const listeners = new Set();

    function onMessage(e) {
        const msg = e.data;
        if (!msg || typeof msg !== 'object') return;
        if (e.source !== iframe.contentWindow) return;

        if (msg.type === 'preview:ready') {
            ready = true;
            while (pending.length) send(pending.shift());
            emit({ type: 'ready', data: msg });
        } else if (typeof msg.type === 'string' && msg.type.startsWith('preview:')) {
            emit({ type: msg.type.slice('preview:'.length), data: msg });
        }
    }

    function emit(evt) {
        for (const l of listeners) {
            try { l(evt); } catch (err) { console.error('[bridge] listener error', err); }
        }
    }

    function send(msg) {
        if (!ready) { pending.push(msg); return; }
        try {
            iframe.contentWindow?.postMessage(msg, '*');
        } catch (err) {
            console.warn('[bridge] postMessage failed', err);
        }
    }

    window.addEventListener('message', onMessage);

    // Whenever the iframe reloads, reset the ready state so the next
    // handshake is awaited before sending anything.
    iframe.addEventListener('load', () => {
        ready = false;
    });

    return {
        on(fn)                  { listeners.add(fn); return () => listeners.delete(fn); },
        send,
        setMany(changes)        { send({ type: 'editor:setMany', changes }); },
        goToScene(sceneId, cmds){ send({ type: 'editor:goToScene', sceneId, commands: cmds }); },

        /* Live geometry edit: replace the preview's whole geojson without a
         * reload. Used by the Map Builder's geometry-edit tool so dragging /
         * scaling / rotating a unit updates the running preview instantly. */
        patchGeojson(geojson)   { send({ type: 'editor:patchGeojson', geojson }); },

        /* Live 3D model placement: rebuild the preview's models layer from
         * the supplied placement list (merged across floors). */
        setModels(models)       { send({ type: 'editor:setModels', models }); },
        highlight(selectors, label) {
            if (!selectors || !selectors.length) {
                send({ type: 'editor:clearHighlight' });
                return;
            }
            send({ type: 'editor:highlight', selectors, label });
        },
        clearHighlight()        { send({ type: 'editor:clearHighlight' }); },

        /* Items tab helpers — drive a dedicated preview iframe into the
         * minimal "item editor" mode and listen for polygon clicks. */
        enterItemEditor()       { send({ type: 'editor:goToScene', commands: [{ type: 'goToItemEditor' }] }); },
        highlightItem(id)       { send({ type: 'editor:highlightItem', id: id || null }); },
        setItemEditorMode(enabled) { send({ type: 'editor:setItemEditorMode', enabled }); },

        destroy() {
            window.removeEventListener('message', onMessage);
            listeners.clear();
        },
    };
}
