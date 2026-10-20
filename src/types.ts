export interface MediaInfo {
  has_player: boolean;
  player_name?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  album_art_url?: string | null;
  playback_status: "Playing" | "Paused" | "Stopped" | "No active playback" | string;
  position_ms?: number | null;
  duration_ms?: number | null;
  can_play: boolean;
  can_pause: boolean;
  can_go_next: boolean;
  can_go_previous: boolean;
  can_seek?: boolean;
}

export interface BatteryInfo {
  has_battery: boolean;
  percentage: number;
  state: string;
  is_charging: boolean;
}

export interface SystemStats {
  cpu_percentage: number;
  ram_used_mb: number;
  ram_total_mb: number;
  ram_percentage: number;
  volume: number;
  is_muted: boolean;
}

export type CapabilityStatus = "verified" | "unverified" | "unsupported";

export type CallProvider = "whatsapp-web" | "whatsapp-desktop" | "telegram-web";

export type CallDirection = "incoming" | "outgoing";

export type CallState =
  | "idle"
  | "incoming"
  | "answering"
  | "active"
  | "ending"
  | "ended";

export interface CallCapabilities {
  accept: CapabilityStatus;
  decline: CapabilityStatus;
  end: CapabilityStatus;
  mute: CapabilityStatus;
  speaker: CapabilityStatus;
}

export interface CallInfo {
  id: string;
  provider: CallProvider;
  direction: CallDirection;
  state: CallState;
  contactName?: string | null;
  avatarUrl?: string | null;
  startedAt?: number | null; // epoch ms when confirmed connected
  isMuted?: boolean;
  capabilities: CallCapabilities;
  error?: string | null;
}

export type ActiveView = "menu" | "music" | "files" | "companion" | "calls" | "system";

export interface DockedFile {
  id: string;
  name: string;
  path: string;
  extension: string;
  size?: number;
  addedAt: number;
  exists: boolean;
  thumbnailUrl?: string;
}


