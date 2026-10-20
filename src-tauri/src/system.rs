use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;
use std::sync::Mutex;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemStats {
    pub cpu_percentage: u8,
    pub ram_used_mb: u64,
    pub ram_total_mb: u64,
    pub ram_percentage: u8,
    pub volume: u8,
    pub is_muted: bool,
}

static LAST_CPU: Mutex<Option<(u64, u64, Instant)>> = Mutex::new(None);
static LAST_VOLUME: Mutex<(u8, bool)> = Mutex::new((70, false));

pub fn get_system_stats() -> SystemStats {
    let cpu_percentage = calculate_cpu();
    let (ram_used_mb, ram_total_mb, ram_percentage) = calculate_ram();
    let (volume, is_muted) = get_audio_volume();

    SystemStats {
        cpu_percentage,
        ram_used_mb,
        ram_total_mb,
        ram_percentage,
        volume,
        is_muted,
    }
}

fn calculate_cpu() -> u8 {
    if let Ok(content) = fs::read_to_string("/proc/stat") {
        if let Some(first_line) = content.lines().next() {
            let parts: Vec<u64> = first_line
                .split_whitespace()
                .skip(1)
                .filter_map(|s| s.parse::<u64>().ok())
                .collect();

            if parts.len() >= 4 {
                let idle = parts[3] + parts.get(4).copied().unwrap_or(0);
                let total: u64 = parts.iter().sum();
                let now = Instant::now();

                let mut lock = LAST_CPU.lock().unwrap_or_else(|e| e.into_inner());
                if let Some((prev_idle, prev_total, prev_time)) = *lock {
                    if total > prev_total && now.duration_since(prev_time).as_millis() >= 100 {
                        let delta_idle = idle.saturating_sub(prev_idle);
                        let delta_total = total.saturating_sub(prev_total);
                        if delta_total > 0 {
                            let usage = (100.0 * (1.0 - (delta_idle as f64 / delta_total as f64))) as u8;
                            *lock = Some((idle, total, now));
                            return usage.min(100);
                        }
                    }
                } else {
                    *lock = Some((idle, total, now));
                }
            }
        }
    }
    15
}

fn calculate_ram() -> (u64, u64, u8) {
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        let mut total_kb: u64 = 0;
        let mut available_kb: u64 = 0;

        for line in content.lines() {
            if line.starts_with("MemTotal:") {
                total_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
            } else if line.starts_with("MemAvailable:") {
                available_kb = line
                    .split_whitespace()
                    .nth(1)
                    .and_then(|v| v.parse().ok())
                    .unwrap_or(0);
            }
            if total_kb > 0 && available_kb > 0 {
                break;
            }
        }

        if total_kb > 0 {
            let used_kb = total_kb.saturating_sub(available_kb);
            let total_mb = total_kb / 1024;
            let used_mb = used_kb / 1024;
            let percent = ((used_kb as f64 / total_kb as f64) * 100.0) as u8;
            return (used_mb, total_mb, percent.min(100));
        }
    }
    (4096, 16384, 25)
}

fn get_audio_volume() -> (u8, bool) {
    // Try wpctl first (PipeWire WirePlumber default on Ubuntu 24.04)
    if let Ok(output) = Command::new("wpctl")
        .args(["get-volume", "@DEFAULT_AUDIO_SINK@"])
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            let is_muted = out_str.contains("[MUTED]");
            if let Some(vol_part) = out_str.split_whitespace().nth(1) {
                if let Ok(vol_f) = vol_part.parse::<f64>() {
                    let vol = (vol_f * 100.0).round() as u8;
                    let mut lock = LAST_VOLUME.lock().unwrap_or_else(|e| e.into_inner());
                    *lock = (vol, is_muted);
                    return (vol, is_muted);
                }
            }
        }
    }

    // Try pactl fallback
    if let Ok(output) = Command::new("pactl")
        .args(["get-sink-volume", "@DEFAULT_SINK@"])
        .output()
    {
        if output.status.success() {
            let out_str = String::from_utf8_lossy(&output.stdout);
            for part in out_str.split_whitespace() {
                if part.ends_with('%') {
                    if let Ok(num) = part.trim_end_matches('%').parse::<u8>() {
                        let mut lock = LAST_VOLUME.lock().unwrap_or_else(|e| e.into_inner());
                        lock.0 = num;
                        return (num, lock.1);
                    }
                }
            }
        }
    }

    let lock = LAST_VOLUME.lock().unwrap_or_else(|e| e.into_inner());
    *lock
}

pub fn set_system_volume(vol: u8) {
    let vol_clamped = vol.min(100);
    let mut lock = LAST_VOLUME.lock().unwrap_or_else(|e| e.into_inner());
    lock.0 = vol_clamped;

    let ratio = vol_clamped as f64 / 100.0;
    let _ = Command::new("wpctl")
        .args(["set-volume", "@DEFAULT_AUDIO_SINK@", &format!("{:.2}", ratio)])
        .spawn();

    let _ = Command::new("pactl")
        .args(["set-sink-volume", "@DEFAULT_SINK@", &format!("{}%", vol_clamped)])
        .spawn();
}

pub fn toggle_system_mute() -> bool {
    let mut lock = LAST_VOLUME.lock().unwrap_or_else(|e| e.into_inner());
    let new_mute = !lock.1;
    lock.1 = new_mute;

    let _ = Command::new("wpctl")
        .args(["set-mute", "@DEFAULT_AUDIO_SINK@", "toggle"])
        .spawn();

    let _ = Command::new("pactl")
        .args(["set-sink-mute", "@DEFAULT_SINK@", "toggle"])
        .spawn();

    new_mute
}

