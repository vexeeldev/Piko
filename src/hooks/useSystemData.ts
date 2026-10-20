import { useState, useEffect, useCallback, useRef } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { MediaInfo, BatteryInfo, SystemStats } from "../types";

const DEFAULT_BATTERY: BatteryInfo = {
  has_battery: true,
  percentage: 100,
  state: "Full",
  is_charging: true,
};

const DEFAULT_STATS: SystemStats = {
  cpu_percentage: 18,
  ram_used_mb: 6144,
  ram_total_mb: 16384,
  ram_percentage: 38,
  volume: 70,
  is_muted: false,
};

const DEFAULT_MEDIA: MediaInfo = {
  has_player: false,
  player_name: null,
  title: null,
  artist: null,
  album: null,
  album_art_url: null,
  playback_status: "No active playback",
  position_ms: null,
  duration_ms: null,
  can_play: false,
  can_pause: false,
  can_go_next: false,
  can_go_previous: false,
};

export function useSystemData(isExpanded: boolean) {
  const [battery, setBattery] = useState<BatteryInfo>(DEFAULT_BATTERY);
  const [media, setMedia] = useState<MediaInfo>(DEFAULT_MEDIA);
  const [stats, setStats] = useState<SystemStats>(DEFAULT_STATS);
  const isMountedRef = useRef(true);

  const fetchBattery = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const data = await invoke<BatteryInfo>("get_battery_info");
      if (isMountedRef.current && data) {
        setBattery(data);
      }
    } catch (err) {
      console.warn("Failed to fetch battery info:", err);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const data = await invoke<SystemStats>("get_system_stats");
      if (isMountedRef.current && data) {
        setStats(data);
      }
    } catch (err) {
      console.warn("Failed to fetch system stats:", err);
    }
  }, []);

  const setVolume = useCallback(async (newVol: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(newVol)));
    setStats((prev) => ({ ...prev, volume: clamped }));
    if (!isTauri()) return;
    try {
      await invoke("set_system_volume", { volume: clamped });
    } catch (err) {
      console.warn("Failed to set system volume:", err);
    }
  }, []);

  const toggleMute = useCallback(async () => {
    setStats((prev) => ({ ...prev, is_muted: !prev.is_muted }));
    if (!isTauri()) return;
    try {
      const isMuted = await invoke<boolean>("toggle_system_mute");
      setStats((prev) => ({ ...prev, is_muted: isMuted }));
    } catch (err) {
      console.warn("Failed to toggle system mute:", err);
    }
  }, []);

  const fetchMedia = useCallback(async () => {
    if (!isTauri()) return;
    try {
      const data = await invoke<MediaInfo>("get_media_info");
      if (isMountedRef.current && data) {
        setMedia(data);
      }
    } catch (err) {
      console.warn("Failed to fetch media info:", err);
    }
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await invoke("media_play_pause");
      setTimeout(fetchMedia, 100);
      setTimeout(fetchMedia, 400);
    } catch (err) {
      console.warn("Failed to toggle play/pause:", err);
    }
  }, [fetchMedia]);

  const nextTrack = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await invoke("media_next");
      setTimeout(fetchMedia, 150);
      setTimeout(fetchMedia, 500);
    } catch (err) {
      console.warn("Failed to skip to next track:", err);
    }
  }, [fetchMedia]);

  const previousTrack = useCallback(async () => {
    if (!isTauri()) return;
    try {
      await invoke("media_previous");
      setTimeout(fetchMedia, 150);
      setTimeout(fetchMedia, 500);
    } catch (err) {
      console.warn("Failed to go to previous track:", err);
    }
  }, [fetchMedia]);

  const seekTrack = useCallback(async (positionMs: number) => {
    if (!isTauri()) return;
    try {
      await invoke("media_seek", { positionMs });
      setTimeout(fetchMedia, 100);
      setTimeout(fetchMedia, 400);
    } catch (err) {
      console.warn("Failed to seek track:", err);
    }
  }, [fetchMedia]);

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchBattery();
    fetchMedia();
    fetchStats();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchBattery, fetchMedia, fetchStats]);

  // Periodic polling for media & stats (faster when expanded)
  useEffect(() => {
    const intervalTime = isExpanded ? 1500 : 4000;
    const mediaInterval = setInterval(() => {
      fetchMedia();
      if (isExpanded) {
        fetchStats();
      }
    }, intervalTime);

    return () => clearInterval(mediaInterval);
  }, [isExpanded, fetchMedia, fetchStats]);

  // Periodic polling for battery
  useEffect(() => {
    const batteryInterval = setInterval(() => {
      fetchBattery();
    }, 8000);

    return () => clearInterval(batteryInterval);
  }, [fetchBattery]);

  return {
    battery,
    media,
    stats,
    setVolume,
    toggleMute,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seekTrack,
    refreshMedia: fetchMedia,
    refreshBattery: fetchBattery,
    refreshStats: fetchStats,
  };
}

