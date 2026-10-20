use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::ops::Deref;
use zbus::blocking::{Connection, Proxy};
use zbus::zvariant::{OwnedValue, Value};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub has_player: bool,
    pub player_name: Option<String>,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub album_art_url: Option<String>,
    pub playback_status: String, // "Playing", "Paused", "Stopped", "No active playback"
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub can_play: bool,
    pub can_pause: bool,
    pub can_go_next: bool,
    pub can_go_previous: bool,
    pub can_seek: bool,
}

impl Default for MediaInfo {
    fn default() -> Self {
        Self {
            has_player: false,
            player_name: None,
            title: None,
            artist: None,
            album: None,
            album_art_url: None,
            playback_status: "No active playback".to_string(),
            position_ms: None,
            duration_ms: None,
            can_play: false,
            can_pause: false,
            can_go_next: false,
            can_go_previous: false,
            can_seek: false,
        }
    }
}

pub fn get_media_info() -> MediaInfo {
    let conn = match Connection::session() {
        Ok(c) => c,
        Err(_) => return MediaInfo::default(),
    };

    let player_names = match list_mpris_players(&conn) {
        Ok(names) if !names.is_empty() => names,
        _ => return MediaInfo::default(),
    };

    // Prioritize currently "Playing" player first, then "Paused", else first player
    let mut selected_info: Option<MediaInfo> = None;

    for player_name in player_names {
        if let Ok(info) = query_player(&conn, &player_name) {
            if info.playback_status.eq_ignore_ascii_case("Playing") {
                return info;
            }
            if selected_info.is_none() || info.playback_status.eq_ignore_ascii_case("Paused") {
                selected_info = Some(info);
            }
        }
    }

    selected_info.unwrap_or_default()
}

pub fn media_play_pause() -> Result<bool, String> {
    let conn = Connection::session().map_err(|e| e.to_string())?;
    let player_name = find_active_player(&conn)?;
    let proxy = Proxy::new(
        &conn,
        player_name.as_str(),
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .map_err(|e| e.to_string())?;

    let _: () = proxy.call("PlayPause", &()).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn media_next() -> Result<bool, String> {
    let conn = Connection::session().map_err(|e| e.to_string())?;
    let player_name = find_active_player(&conn)?;
    let proxy = Proxy::new(
        &conn,
        player_name.as_str(),
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .map_err(|e| e.to_string())?;

    let _: () = proxy.call("Next", &()).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn media_previous() -> Result<bool, String> {
    let conn = Connection::session().map_err(|e| e.to_string())?;
    let player_name = find_active_player(&conn)?;
    let proxy = Proxy::new(
        &conn,
        player_name.as_str(),
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .map_err(|e| e.to_string())?;

    let _: () = proxy.call("Previous", &()).map_err(|e| e.to_string())?;
    Ok(true)
}

pub fn media_seek(position_ms: u64) -> Result<bool, String> {
    let conn = Connection::session().map_err(|e| e.to_string())?;
    let player_name = find_active_player(&conn)?;
    let proxy = Proxy::new(
        &conn,
        player_name.as_str(),
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )
    .map_err(|e| e.to_string())?;

    let metadata_map: HashMap<String, OwnedValue> =
        proxy.get_property("Metadata").unwrap_or_default();

    if let Some(trackid_val) = metadata_map.get("mpris:trackid") {
        if let Ok(trackid) = zbus::zvariant::ObjectPath::try_from(trackid_val.clone()) {
            let position_us = (position_ms as i64) * 1000;
            let call_res: Result<(), _> = proxy.call("SetPosition", &(&trackid, position_us));
            if call_res.is_ok() {
                return Ok(true);
            }
        }
    }

    if let Ok(current_pos_us) = proxy.get_property::<i64>("Position") {
        let target_us = (position_ms as i64) * 1000;
        let offset_us = target_us - current_pos_us;
        let _: () = proxy.call("Seek", &(offset_us)).map_err(|e| e.to_string())?;
        return Ok(true);
    }

    Ok(false)
}

fn list_mpris_players(conn: &Connection) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    let dbus_proxy = Proxy::new(
        conn,
        "org.freedesktop.DBus",
        "/org/freedesktop/DBus",
        "org.freedesktop.DBus",
    )?;

    let names: Vec<String> = dbus_proxy.call("ListNames", &())?;
    let mpris_names: Vec<String> = names
        .into_iter()
        .filter(|n| n.starts_with("org.mpris.MediaPlayer2."))
        .collect();

    Ok(mpris_names)
}

fn find_active_player(conn: &Connection) -> Result<String, String> {
    let players = list_mpris_players(conn).map_err(|e| e.to_string())?;
    if players.is_empty() {
        return Err("No active media players found".to_string());
    }

    let mut paused_player = None;
    for player in &players {
        if let Ok(proxy) = Proxy::new(
            conn,
            player.as_str(),
            "/org/mpris/MediaPlayer2",
            "org.mpris.MediaPlayer2.Player",
        ) {
            if let Ok(status) = proxy.get_property::<String>("PlaybackStatus") {
                if status.eq_ignore_ascii_case("Playing") {
                    return Ok(player.clone());
                } else if status.eq_ignore_ascii_case("Paused") && paused_player.is_none() {
                    paused_player = Some(player.clone());
                }
            }
        }
    }

    if let Some(player) = paused_player {
        return Ok(player);
    }

    Ok(players[0].clone())
}

fn query_player(
    conn: &Connection,
    player_name: &str,
) -> Result<MediaInfo, Box<dyn std::error::Error>> {
    let proxy = Proxy::new(
        conn,
        player_name,
        "/org/mpris/MediaPlayer2",
        "org.mpris.MediaPlayer2.Player",
    )?;

    let playback_status = proxy
        .get_property::<String>("PlaybackStatus")
        .unwrap_or_else(|_| "Stopped".to_string());

    let can_play = proxy.get_property::<bool>("CanPlay").unwrap_or(true);
    let can_pause = proxy.get_property::<bool>("CanPause").unwrap_or(true);
    let can_go_next = proxy.get_property::<bool>("CanGoNext").unwrap_or(true);
    let can_go_previous = proxy.get_property::<bool>("CanGoPrevious").unwrap_or(true);
    let can_seek = proxy.get_property::<bool>("CanSeek").unwrap_or(false);

    let position_ms = proxy
        .get_property::<i64>("Position")
        .ok()
        .map(|micros| (micros.max(0) / 1000) as u64);

    let metadata_map: HashMap<String, OwnedValue> =
        proxy.get_property("Metadata").unwrap_or_default();

    let title = metadata_map
        .get("xesam:title")
        .and_then(extract_string);

    let artist = metadata_map
        .get("xesam:artist")
        .and_then(extract_string_or_list);

    let album = metadata_map
        .get("xesam:album")
        .and_then(extract_string);

    let raw_art_url = metadata_map
        .get("mpris:artUrl")
        .or_else(|| metadata_map.get("xesam:artUrl"))
        .or_else(|| metadata_map.get("xesam:url"))
        .or_else(|| metadata_map.get("artUrl"))
        .and_then(extract_string);

    let album_art_url = resolve_artwork_url(raw_art_url);

    let duration_ms = metadata_map
        .get("mpris:length")
        .and_then(extract_u64)
        .map(|micros| micros / 1000);

    let clean_name = player_name
        .strip_prefix("org.mpris.MediaPlayer2.")
        .unwrap_or(player_name)
        .to_string();

    Ok(MediaInfo {
        has_player: true,
        player_name: Some(clean_name),
        title,
        artist,
        album,
        album_art_url,
        playback_status,
        position_ms,
        duration_ms,
        can_play,
        can_pause,
        can_go_next,
        can_go_previous,
        can_seek,
    })
}

fn resolve_artwork_url(raw_url: Option<String>) -> Option<String> {
    let raw = raw_url?;
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // 1. If it's a file:// URL or local filesystem path
    if trimmed.starts_with("file://") || trimmed.starts_with('/') {
        let mut candidate_paths: Vec<std::path::PathBuf> = Vec::new();

        if trimmed.starts_with("file://") {
            if let Ok(parsed) = url::Url::parse(trimmed) {
                if let Ok(p) = parsed.to_file_path() {
                    candidate_paths.push(p);
                }
            }
            let stripped = trimmed.trim_start_matches("file://");
            candidate_paths.push(std::path::PathBuf::from(stripped));

            // Try percent-decoding
            if let Ok(dummy) = url::Url::parse("http://localhost") {
                if let Ok(parsed_rel) = dummy.join(stripped) {
                    candidate_paths.push(std::path::PathBuf::from(parsed_rel.path()));
                }
            }
        } else {
            candidate_paths.push(std::path::PathBuf::from(trimmed));
        }

        for path in candidate_paths {
            if path.exists() && path.is_file() {
                // Safety: limit max file size to 10MB
                if let Ok(meta) = path.metadata() {
                    if meta.len() > 10 * 1024 * 1024 {
                        return None;
                    }
                }
                if let Ok(bytes) = std::fs::read(&path) {
                    let ext = path
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    let mime = match ext.as_str() {
                        "png" => "image/png",
                        "webp" => "image/webp",
                        "svg" => "image/svg+xml",
                        "gif" => "image/gif",
                        _ => {
                            if bytes.len() >= 8 && &bytes[0..8] == b"\x89PNG\r\n\x1a\n" {
                                "image/png"
                            } else if bytes.len() >= 12
                                && &bytes[0..4] == b"RIFF"
                                && &bytes[8..12] == b"WEBP"
                            {
                                "image/webp"
                            } else {
                                "image/jpeg"
                            }
                        }
                    };

                    use base64::engine::general_purpose::STANDARD;
                    use base64::Engine;
                    let b64 = STANDARD.encode(&bytes);
                    return Some(format!("data:{};base64,{}", mime, b64));
                }
            }
        }
        return None;
    }

    // 2. HTTP/HTTPS or pre-encoded data: URLs are safely pass-through
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("data:image/")
    {
        return Some(trimmed.to_string());
    }

    None
}

fn recursive_str(val: &Value) -> Option<String> {
    match val {
        Value::Str(s) => Some(s.as_str().to_string()),
        Value::Value(inner) => recursive_str(inner),
        _ => None,
    }
}

fn extract_string(val: &OwnedValue) -> Option<String> {
    recursive_str(val.deref())
}

fn recursive_str_or_list(val: &Value) -> Option<String> {
    match val {
        Value::Str(s) => Some(s.as_str().to_string()),
        Value::Array(arr) => {
            let items: Vec<String> = arr
                .iter()
                .filter_map(recursive_str)
                .collect();
            if items.is_empty() {
                None
            } else {
                Some(items.join(", "))
            }
        }
        Value::Value(inner) => recursive_str_or_list(inner),
        _ => None,
    }
}

fn extract_string_or_list(val: &OwnedValue) -> Option<String> {
    recursive_str_or_list(val.deref())
}

fn recursive_u64(val: &Value) -> Option<u64> {
    match val {
        Value::U64(n) => Some(*n),
        Value::I64(n) => Some((*n).max(0) as u64),
        Value::U32(n) => Some(*n as u64),
        Value::I32(n) => Some((*n).max(0) as u64),
        Value::Value(inner) => recursive_u64(inner),
        _ => None,
    }
}

fn extract_u64(val: &OwnedValue) -> Option<u64> {
    recursive_u64(val.deref())
}
