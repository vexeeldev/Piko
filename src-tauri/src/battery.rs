use serde::{Deserialize, Serialize};
use std::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatteryInfo {
    pub has_battery: bool,
    pub percentage: u8,
    pub state: String,
    pub is_charging: bool,
}

pub fn get_battery_info() -> BatteryInfo {
    // 1. Try UPower over D-Bus first
    if let Ok(info) = get_battery_from_upower() {
        if info.has_battery {
            return info;
        }
    }

    // 2. Fallback to /sys/class/power_supply (always accessible on Linux)
    if let Ok(info) = get_battery_from_sysfs() {
        if info.has_battery {
            return info;
        }
    }

    BatteryInfo {
        has_battery: false,
        percentage: 0,
        state: "No battery".to_string(),
        is_charging: false,
    }
}

fn get_battery_from_upower() -> Result<BatteryInfo, Box<dyn std::error::Error>> {
    let conn = zbus::blocking::Connection::system()?;
    let proxy = zbus::blocking::Proxy::new(
        &conn,
        "org.freedesktop.UPower",
        "/org/freedesktop/UPower/devices/DisplayDevice",
        "org.freedesktop.UPower.Device",
    )?;

    let is_present: bool = proxy.get_property("IsPresent").unwrap_or(false);
    let dev_type: u32 = proxy.get_property("Type").unwrap_or(0);
    // Type 2 corresponds to Battery in UPower
    if !is_present && dev_type != 2 {
        return Ok(BatteryInfo {
            has_battery: false,
            percentage: 0,
            state: "No battery".to_string(),
            is_charging: false,
        });
    }

    let percentage_f: f64 = proxy.get_property("Percentage")?;
    let state_u: u32 = proxy.get_property("State").unwrap_or(0);

    let (state_str, is_charging) = match state_u {
        1 => ("Charging", true),
        2 => ("Discharging", false),
        3 => ("Empty", false),
        4 => ("Full", true),
        5 => ("Pending charge", true),
        6 => ("Pending discharge", false),
        _ => ("Unknown", false),
    };

    let percentage = (percentage_f.clamp(0.0, 100.0).round() as u8).min(100);

    Ok(BatteryInfo {
        has_battery: true,
        percentage,
        state: state_str.to_string(),
        is_charging,
    })
}

fn get_battery_from_sysfs() -> Result<BatteryInfo, Box<dyn std::error::Error>> {
    let power_supply_dir = "/sys/class/power_supply";
    let entries = fs::read_dir(power_supply_dir)?;

    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().to_string();
        if file_name.starts_with("BAT") {
            let path = entry.path();
            let capacity_path = path.join("capacity");
            let status_path = path.join("status");

            if capacity_path.exists() {
                let capacity_str = fs::read_to_string(&capacity_path)?.trim().to_string();
                let capacity: u8 = capacity_str.parse().unwrap_or(0).min(100);

                let status = if status_path.exists() {
                    fs::read_to_string(&status_path)?.trim().to_string()
                } else {
                    "Unknown".to_string()
                };

                let is_charging = status.eq_ignore_ascii_case("Charging")
                    || status.eq_ignore_ascii_case("Full");

                return Ok(BatteryInfo {
                    has_battery: true,
                    percentage: capacity,
                    state: status,
                    is_charging,
                });
            }
        }
    }

    Ok(BatteryInfo {
        has_battery: false,
        percentage: 0,
        state: "No battery".to_string(),
        is_charging: false,
    })
}

