
mod battery;
mod call_bridge;
mod mpris;
mod system;

use battery::BatteryInfo;
use mpris::MediaInfo;
use serde::Serialize;
use std::sync::{Arc, Mutex};
use system::SystemStats;
use tauri::Manager;

#[derive(Serialize)]
pub struct BridgeInfo {
    pub port: u16,
    pub token: String,
}

#[tauri::command]
fn get_battery_info() -> BatteryInfo {
    battery::get_battery_info()
}

#[tauri::command]
fn get_media_info() -> MediaInfo {
    mpris::get_media_info()
}

#[tauri::command]
fn media_play_pause() -> Result<bool, String> {
    mpris::media_play_pause()
}

#[tauri::command]
fn media_next() -> Result<bool, String> {
    mpris::media_next()
}

#[tauri::command]
fn media_previous() -> Result<bool, String> {
    mpris::media_previous()
}

#[tauri::command]
fn media_seek(position_ms: u64) -> Result<bool, String> {
    mpris::media_seek(position_ms)
}

#[tauri::command]
fn bridge_call_action(
    call_id: String,
    action: String,
    bridge_state: tauri::State<'_, Arc<Mutex<call_bridge::BridgeState>>>,
) -> Result<String, String> {
    let mut state = bridge_state.lock().map_err(|e| e.to_string())?;
    let action_id = state.queue_action(call_id, action);
    Ok(action_id)
}

#[tauri::command]
fn get_bridge_info(
    bridge_state: tauri::State<'_, Arc<Mutex<call_bridge::BridgeState>>>,
) -> Result<BridgeInfo, String> {
    let state = bridge_state.lock().map_err(|e| e.to_string())?;
    Ok(BridgeInfo {
        port: call_bridge::BRIDGE_PORT,
        token: state.token.clone(),
    })
}

#[tauri::command]
fn check_file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[tauri::command]
fn get_file_thumbnail(path: String) -> Option<String> {
    let p = std::path::Path::new(&path);
    if !p.is_file() {
        return None;
    }
    let ext = p.extension()?.to_str()?.to_lowercase();
    let mime = match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        _ => return None,
    };

    if let Ok(metadata) = std::fs::metadata(p) {
        if metadata.len() > 10 * 1024 * 1024 {
            return None;
        }
    }

    if let Ok(bytes) = std::fs::read(p) {
        use base64::Engine;
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Some(format!("data:{};base64,{}", mime, b64));
    }
    None
}

#[tauri::command]
fn get_system_stats() -> SystemStats {
    system::get_system_stats()
}

#[tauri::command]
fn set_system_volume(volume: u8) {
    system::set_system_volume(volume);
}

#[tauri::command]
fn toggle_system_mute() -> bool {
    system::toggle_system_mute()
}

#[derive(Serialize)]
pub struct CursorPos {
    pub screen_x: f64,
    pub screen_y: f64,
    pub client_x: f64,
    pub client_y: f64,
}

#[tauri::command]
fn get_global_cursor_position(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Option<CursorPos> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let win_pos = window.outer_position().unwrap_or(tauri::PhysicalPosition::new(0, 0));
    let win_x = win_pos.x as f64 / scale;
    let win_y = win_pos.y as f64 / scale;

    // 1. Wayland GNOME Extension Shared Memory bridge (/dev/shm/dynamic_island_cursor)
    if let Ok(content) = std::fs::read_to_string("/dev/shm/dynamic_island_cursor") {
        let parts: Vec<&str> = content.trim().split(',').collect();
        if parts.len() == 2 {
            if let (Ok(sx), Ok(sy)) = (parts[0].parse::<f64>(), parts[1].parse::<f64>()) {
                return Some(CursorPos {
                    screen_x: sx,
                    screen_y: sy,
                    client_x: sx - win_x,
                    client_y: sy - win_y,
                });
            }
        }
    }

    // 2. Standard Tauri cursor position fallback (X11)
    let cursor = app.cursor_position().ok()?;
    if cursor.x == 0.0 && cursor.y == 0.0 {
        return None;
    }

    let screen_x = cursor.x / scale;
    let screen_y = cursor.y / scale;

    Some(CursorPos {
        screen_x,
        screen_y,
        client_x: screen_x - win_x,
        client_y: screen_y - win_y,
    })
}

#[tauri::command]
fn set_island_input_shape(
    window: tauri::WebviewWindow,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
    radius: Option<i32>,
) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use gtk::prelude::*;
        if let Ok(gtk_window) = window.gtk_window() {
            if width <= 0 || height <= 0 {
                gtk_window.input_shape_combine_region(None);
            } else {
                let r = radius.unwrap_or(0).max(0);
                let region = if r > 0 {
                    let r = r.min(width / 2).min(height / 2);
                    // Central body spanning full width between top & bottom corner arcs
                    let reg = cairo::Region::create_rectangle(&cairo::RectangleInt::new(
                        x,
                        y + r,
                        width,
                        height - 2 * r,
                    ));
                    let r_f = r as f64;
                    for dy in 0..r {
                        let cy = (r - 1 - dy) as f64 + 0.5;
                        let cx = (r_f * r_f - cy * cy).max(0.0).sqrt();
                        let inset = (r_f - cx).floor() as i32;
                        let row_width = width - 2 * inset;
                        if row_width > 0 {
                            // Full-width continuous top slice (prevents gaps near edges)
                            let _ = reg.union_rectangle(&cairo::RectangleInt::new(
                                x + inset,
                                y + dy,
                                row_width,
                                1,
                            ));
                            // Full-width continuous bottom slice
                            let _ = reg.union_rectangle(&cairo::RectangleInt::new(
                                x + inset,
                                y + height - 1 - dy,
                                row_width,
                                1,
                            ));
                        }
                    }
                    reg
                } else {
                    let rect = cairo::RectangleInt::new(x, y, width, height);
                    cairo::Region::create_rectangle(&rect)
                };
                gtk_window.input_shape_combine_region(Some(&region));
            }
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_battery_info,
            get_media_info,
            media_play_pause,
            media_next,
            media_previous,
            media_seek,
            bridge_call_action,
            get_bridge_info,
            check_file_exists,
            set_island_input_shape,
            get_file_thumbnail,
            get_system_stats,
            set_system_volume,
            toggle_system_mute,
            get_global_cursor_position
        ])
        .setup(|app| {
            let token = call_bridge::get_or_create_token();
            let (bridge_state, _port) =
                call_bridge::start_local_bridge(token, app.handle().clone());
            app.manage(bridge_state);

            #[cfg(desktop)]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let aot_res = window.set_always_on_top(true);
                    let ws_res = window.set_visible_on_all_workspaces(true);
                    let is_aot = window.is_always_on_top().unwrap_or(false);
                    println!(
                        "[DynamicIsland] Startup window initialization: set_always_on_top={:?} (verified is_always_on_top={}), set_visible_on_all_workspaces={:?}",
                        aot_res, is_aot, ws_res
                    );

                    #[cfg(target_os = "linux")]
                    {
                        use gtk::prelude::*;
                        if let Ok(gtk_window) = window.gtk_window() {
                            gtk_window.set_keep_above(true);
                            gtk_window.stick();
                            gtk_window.set_skip_taskbar_hint(true);
                            gtk_window.set_skip_pager_hint(true);

                            // Set initial compact input shape (x=95, y=0, w=280, h=75) so transparent area is click-through
                            let initial_rect = cairo::RectangleInt::new(95, 0, 280, 75);
                            let initial_region = cairo::Region::create_rectangle(&initial_rect);
                            gtk_window.input_shape_combine_region(Some(&initial_region));

                            if let Some(screen) = gtk::prelude::GtkWindowExt::screen(&gtk_window) {
                                let provider = gtk::CssProvider::new();
                                let css = b"
                                    window, window.background, decoration, .csd {
                                        background-color: transparent !important;
                                        background: transparent !important;
                                        box-shadow: none !important;
                                        border: none !important;
                                        margin: 0 !important;
                                        padding: 0 !important;
                                    }
                                ";
                                if provider.load_from_data(css).is_ok() {
                                    gtk::StyleContext::add_provider_for_screen(
                                        &screen,
                                        &provider,
                                        gtk::STYLE_PROVIDER_PRIORITY_APPLICATION,
                                    );
                                }
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_battery() {
        let b = get_battery_info();
        println!("Battery result: {:?}", b);
        assert!(b.has_battery);
        assert!(b.percentage <= 100);
    }

    #[test]
    fn test_media() {
        let m = get_media_info();
        println!("Media result: {:?}", m);
        assert!(!m.playback_status.is_empty());
    }
}
