class EventBus {
    #listeners = new Map();

    on(event, callback) {
        if (!this.#listeners.has(event)) {
            this.#listeners.set(event, new Set());
        }
        this.#listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        const set = this.#listeners.get(event);
        if (set) {
            set.delete(callback);
            if (set.size === 0) this.#listeners.delete(event);
        }
    }

    emit(event, data) {
        const set = this.#listeners.get(event);
        if (set) {
            set.forEach(cb => {
                try { cb(data); }
                catch (e) { console.error(`[EventBus] Error in "${event}" handler:`, e); }
            });
        }
    }

    once(event, callback) {
        const wrapper = (data) => {
            this.off(event, wrapper);
            callback(data);
        };
        return this.on(event, wrapper);
    }

    removeAllListeners(event) {
        if (event) {
            this.#listeners.delete(event);
        } else {
            this.#listeners.clear();
        }
    }
}

export const eventBus = new EventBus();
