import GLib from 'gi://GLib';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

export default class DynamicIslandHelperExtension extends Extension {
    enable() {
        this._windowCreatedId = global.display.connect('window-created', (_display, metaWindow) => {
            this._applyWindowRules(metaWindow);
        });

        // Apply to any already open Dynamic Island window
        for (const actor of global.get_window_actors()) {
            const metaWindow = actor.meta_window;
            if (metaWindow) {
                this._applyWindowRules(metaWindow);
            }
        }

        // Global cursor broadcast to /dev/shm for Dynamic Island Companion on Wayland
        let lastX = -1;
        let lastY = -1;
        this._mouseTimerId = GLib.timeout_add(GLib.PRIORITY_LOW, 40, () => {
            try {
                const [x, y] = global.get_pointer();
                if (x !== lastX || y !== lastY) {
                    lastX = x;
                    lastY = y;
                    GLib.file_set_contents('/dev/shm/dynamic_island_cursor', `${x},${y}`);
                }
            } catch (e) {
                // Ignore any write errors
            }
            return GLib.SOURCE_CONTINUE;
        });
    }

    _applyWindowRules(metaWindow) {
        if (!metaWindow) return;
        
        const title = metaWindow.get_title() || '';
        const wmClass = metaWindow.get_wm_class() || '';
        const gtkAppId = metaWindow.get_gtk_application_id() || '';

        if (
            title.includes('Dynamic Island') ||
            wmClass.toLowerCase().includes('dynamic-island') ||
            gtkAppId.toLowerCase().includes('dynamic-island')
        ) {
            metaWindow.make_above();
            metaWindow.stick();
        }
    }

    disable() {
        if (this._windowCreatedId) {
            global.display.disconnect(this._windowCreatedId);
            this._windowCreatedId = null;
        }
        if (this._mouseTimerId) {
            GLib.Source.remove(this._mouseTimerId);
            this._mouseTimerId = null;
        }
        try {
            GLib.unlink('/dev/shm/dynamic_island_cursor');
        } catch (e) {}
    }
}
