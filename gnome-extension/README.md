# Dynamic Island GNOME Wayland Helper Extension

This is an **optional, separate** GNOME Shell extension (compatible with GNOME Shell 45, 46, and 47 on Ubuntu 24.04).

## Why is this extension needed on Wayland?
Under native Wayland (`xdg_shell`), unprivileged application windows cannot unilaterally force themselves to be "always on top" (keep-above) or appear on all workspaces (stick). GNOME Mutter intentionally reserves window stacking order and workspace placement to the compositor for security.

While Tauri and GTK invoke `set_always_on_top(true)` and `set_visible_on_all_workspaces(true)` during startup, GNOME Wayland compositors restrict client-level window placement.

This extension runs inside GNOME Shell compositor space and directly invokes:
- `metaWindow.make_above()`: keeps Dynamic Island above ordinary windows.
- `metaWindow.stick()`: keeps Dynamic Island visible across all GNOME workspaces.

## Installation (Optional)

1. Copy the extension folder to your GNOME Shell extensions directory:
   ```bash
   mkdir -p ~/.local/share/gnome-shell/extensions/dynamic-island-helper@malakul-tech.com
   cp metadata.json extension.js ~/.local/share/gnome-shell/extensions/dynamic-island-helper@malakul-tech.com/
   ```

2. Enable the extension:
   ```bash
   gnome-extensions enable dynamic-island-helper@malakul-tech.com
   ```
   *(Or toggle it in the "Extensions" / "Extension Manager" app).*

