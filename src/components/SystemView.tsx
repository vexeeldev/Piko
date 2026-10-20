import React, { useRef, useState, useEffect } from "react";
import { BatteryInfo, SystemStats } from "../types";

interface SystemViewProps {
  battery: BatteryInfo;
  stats?: SystemStats;
  onSetVolume?: (volume: number) => void;
  onToggleMute?: () => void;
}

export const SystemView: React.FC<SystemViewProps> = ({
  battery,
  stats,
  onSetVolume,
  onToggleMute,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const currentVolume = stats?.volume ?? 70;
  const isMuted = stats?.is_muted ?? false;
  const cpuPercent = stats?.cpu_percentage ?? 18;
  const ramUsedGb = ((stats?.ram_used_mb ?? 5600) / 1024).toFixed(1);
  const ramTotalGb = Math.round((stats?.ram_total_mb ?? 16384) / 1024);
  const ramPercent = stats?.ram_percentage ?? 35;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!sliderRef.current || !onSetVolume) return;
    setIsDragging(true);

    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    onSetVolume(Math.round(ratio * 100));
  };

  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!sliderRef.current || !onSetVolume) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      onSetVolume(Math.round(ratio * 100));
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [isDragging, onSetVolume]);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!onSetVolume) return;
    const step = e.deltaY < 0 ? 5 : -5;
    onSetVolume(Math.max(0, Math.min(100, currentVolume + step)));
  };

  // Battery status configuration
  const isBatteryLow = battery.has_battery && battery.percentage <= 20;
  const powerColor = battery.is_charging
    ? "text-amber-400"
    : isBatteryLow
    ? "text-red-400"
    : "text-emerald-400";
  const powerShadow = battery.is_charging
    ? "drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]"
    : isBatteryLow
    ? "drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]"
    : "drop-shadow-[0_0_6px_rgba(52,211,153,0.6)]";

  return (
    <div
      className="flex flex-col justify-between w-full h-[128px] select-none text-[#F5F5F5]"
      data-no-drag="true"
    >
      {/* =========================================================================
          1. Top Section: Minimalist Line Track with Solid White Circle Knob Slider
          ========================================================================= */}
      <div className="flex items-center gap-3 w-full h-8 px-0.5">
        {/* Mute/Unmute Speaker Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleMute?.();
          }}
          className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer flex-shrink-0 ${
            isMuted
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
              : "bg-white/10 hover:bg-white/20 text-white/90 hover:text-white border border-white/15 hover:scale-105 active:scale-90"
          }`}
          title={isMuted ? "Unmute Volume" : "Mute Volume"}
          aria-label={isMuted ? "Unmute Volume" : "Mute Volume"}
        >
          {isMuted || currentVolume === 0 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v4a2 2 0 0 0 2 2h3l5 4V4.76" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : currentVolume > 50 ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </svg>
          )}
        </button>

        {/* Line Track with Solid White Circle Thumb Knob */}
        <div
          ref={sliderRef}
          onPointerDown={handlePointerDown}
          onWheel={handleWheel}
          className="relative flex-1 h-6 flex items-center cursor-pointer group select-none"
          title={`Volume: ${isMuted ? "Muted" : `${currentVolume}%`} (Drag or scroll)`}
        >
          {/* Background Track Line */}
          <div className="w-full h-[5px] rounded-full bg-white/15 overflow-hidden relative">
            {/* Active Fill Line */}
            <div
              className={`h-full rounded-full transition-all duration-75 ${
                isMuted
                  ? "bg-white/30"
                  : "bg-gradient-to-r from-blue-500 to-indigo-400"
              }`}
              style={{ width: `${isMuted ? 0 : Math.max(0, Math.min(100, currentVolume))}%` }}
            />
          </div>

          {/* Solid White Circle Thumb Knob (no inner dot) */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.6)] border border-black/10 transition-transform ${
              isDragging ? "scale-125" : "group-hover:scale-125"
            } pointer-events-none`}
            style={{ left: `${isMuted ? 0 : Math.max(0, Math.min(100, currentVolume))}%` }}
          />
        </div>

        {/* Volume Percentage Value */}
        <span className="font-mono text-[12px] font-semibold text-white/90 min-w-[38px] text-right">
          {isMuted ? "Muted" : `${currentVolume}%`}
        </span>
      </div>

      {/* =========================================================================
          2. Bottom Section: 3 Hardware Activity Cards (CPU, RAM, Power) - No Hover Effects
          ========================================================================= */}
      <div className="grid grid-cols-3 gap-2 w-full mt-2 h-[82px]">
        {/* --- Card 1: CPU Activity --- */}
        <div className="flex flex-col justify-between p-2 rounded-[14px] bg-[#141417]/70 border border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <rect x="9" y="9" width="6" height="6" />
                <line x1="9" y1="1" x2="9" y2="4" />
                <line x1="15" y1="1" x2="15" y2="4" />
                <line x1="9" y1="20" x2="9" y2="23" />
                <line x1="15" y1="20" x2="15" y2="23" />
                <line x1="20" y1="9" x2="23" y2="9" />
                <line x1="20" y1="14" x2="23" y2="14" />
                <line x1="1" y1="9" x2="4" y2="9" />
                <line x1="1" y1="14" x2="4" y2="14" />
              </svg>
              <span className="text-[9.5px] font-bold text-cyan-400 uppercase tracking-wider">
                CPU
              </span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          </div>

          <div className="flex items-center justify-between gap-2 my-0.5">
            {/* SVG Circular Ring Gauge */}
            <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="75.4"
                  strokeDashoffset={75.4 - (75.4 * Math.max(3, Math.min(100, cpuPercent))) / 100}
                  strokeLinecap="round"
                  className="text-cyan-400 transition-all duration-500 drop-shadow-[0_0_6px_rgba(34,211,238,0.6)]"
                />
              </svg>
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span className="text-[14px] font-mono font-bold text-white leading-none truncate">
                {cpuPercent}%
              </span>
              <span className="text-[9px] text-white/45 font-medium truncate mt-0.5">
                {cpuPercent > 75 ? "Heavy" : cpuPercent > 40 ? "Active" : "Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* --- Card 2: RAM Memory --- */}
        <div className="flex flex-col justify-between p-2 rounded-[14px] bg-[#141417]/70 border border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400">
                <path d="M6 19v-3" />
                <path d="M10 19v-3" />
                <path d="M14 19v-3" />
                <path d="M18 19v-3" />
                <rect x="2" y="6" width="20" height="9" rx="1" />
              </svg>
              <span className="text-[9.5px] font-bold text-purple-400 uppercase tracking-wider">
                RAM
              </span>
            </div>
            <span className="text-[8.5px] font-mono text-purple-300/80 bg-purple-500/15 px-1 py-0.2 rounded-full leading-tight">
              {ramPercent}%
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 my-0.5">
            {/* SVG Circular Ring Gauge */}
            <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="75.4"
                  strokeDashoffset={75.4 - (75.4 * Math.max(3, Math.min(100, ramPercent))) / 100}
                  strokeLinecap="round"
                  className="text-purple-400 transition-all duration-500 drop-shadow-[0_0_6px_rgba(192,132,252,0.6)]"
                />
              </svg>
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span className="text-[13px] font-mono font-bold text-white leading-none truncate">
                {ramUsedGb}G
              </span>
              <span className="text-[9px] text-white/45 font-mono truncate mt-0.5">
                of {ramTotalGb}GB
              </span>
            </div>
          </div>
        </div>

        {/* --- Card 3: Power / Battery --- */}
        <div className="flex flex-col justify-between p-2 rounded-[14px] bg-[#141417]/70 border border-white/[0.08]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={`text-[9.5px] font-bold ${powerColor} uppercase tracking-wider`}>
                Power
              </span>
            </div>
            {battery.is_charging ? (
              <span className="text-[10px] text-amber-400 font-bold leading-none animate-pulse">⚡</span>
            ) : battery.has_battery ? (
              <span className="text-[8.5px] text-white/50 font-mono">BAT</span>
            ) : (
              <span className="text-[8.5px] text-white/50 font-mono">AC</span>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 my-0.5">
            {/* SVG Circular Ring Gauge */}
            <div className="relative w-7 h-7 flex-shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/10" />
                <circle
                  cx="16"
                  cy="16"
                  r="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray="75.4"
                  strokeDashoffset={
                    75.4 -
                    (75.4 *
                      (battery.has_battery
                        ? Math.max(3, Math.min(100, battery.percentage))
                        : 100)) /
                      100
                  }
                  strokeLinecap="round"
                  className={`${powerColor} ${powerShadow} transition-all duration-500`}
                />
              </svg>
            </div>
            <div className="flex flex-col items-end min-w-0">
              <span className="text-[14px] font-mono font-bold text-white leading-none truncate">
                {battery.has_battery ? `${battery.percentage}%` : "100%"}
              </span>
              <span className="text-[9px] text-white/45 font-medium truncate mt-0.5">
                {battery.is_charging ? "Charging" : isBatteryLow ? "Low Batt" : "Optimal"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
