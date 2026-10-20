import React, { useState, useRef } from "react";
import { MediaInfo } from "../types";

interface MusicViewProps {
  media: MediaInfo;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek?: (positionMs: number) => void;
}

function formatTime(ms?: number | null): string {
  if (ms == null || isNaN(ms) || ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export const MusicView: React.FC<MusicViewProps> = ({
  media,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onSeek,
}) => {
  const [artError, setArtError] = useState(false);
  const lastUrlRef = useRef<string | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const isPlaying = media.playback_status.toLowerCase() === "playing";
  const hasPlayer = media.has_player;

  // Reset error when album artwork URL changes
  if (media.album_art_url !== lastUrlRef.current) {
    lastUrlRef.current = media.album_art_url || null;
    if (artError) {
      setArtError(false);
    }
  }

  // Real progress calculation
  const hasDuration =
    media.duration_ms != null && media.duration_ms > 0 && media.position_ms != null;
  const progressPercent = hasDuration
    ? Math.min(100, Math.max(0, (media.position_ms! / media.duration_ms!) * 100))
    : 0;

  // Seek interaction handler
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!hasDuration || !media.can_seek || !onSeek || !progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const targetMs = Math.round(ratio * media.duration_ms!);
    onSeek(targetMs);
  };

  return (
    <div className="flex flex-col justify-between w-full h-[128px] select-none text-[#F5F5F5]">
      {/* 1. Music Row: 46px Artwork + Track Title & Muted Artist */}
      <div className="flex items-center w-full min-w-0">
        <div className="relative w-[46px] h-[46px] rounded-[10px] bg-[#141414] border border-white/[0.08] flex items-center justify-center flex-shrink-0 overflow-hidden text-[#71717A]">
          {media.album_art_url && !artError ? (
            <img
              src={media.album_art_url}
              alt="Album Artwork"
              className="w-full h-full object-cover rounded-[10px]"
              onError={() => setArtError(true)}
            />
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[#71717A]"
              aria-hidden="true"
            >
              <path d="M9 18V5l12-2v13" />
              <circle cx="6" cy="18" r="3" />
              <circle cx="18" cy="16" r="3" />
            </svg>
          )}
        </div>

        <div className="flex flex-col min-w-0 flex-1 justify-center pl-3.5">
          <span className="text-[14px] font-semibold text-[#F5F5F5] truncate leading-snug tracking-tight">
            {media.title || (hasPlayer ? "Unknown Track" : "No active playback")}
          </span>
          <span className="text-[12px] text-[#A1A1AA] truncate leading-tight mt-0.5">
            {media.artist || (hasPlayer ? "Unknown Artist" : "Media player idle")}
          </span>
        </div>
      </div>

      {/* 2. Playback Progress: Thin Track + Elapsed & Total Duration */}
      <div className="w-full flex flex-col gap-1.5" data-no-drag="true">
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          className={`w-full h-[3px] bg-[#1C1C1C] rounded-full overflow-hidden relative transition-all ${
            hasDuration && media.can_seek ? "cursor-pointer hover:h-[4px]" : ""
          }`}
        >
          <div
            className="h-full bg-[#F5F5F5] rounded-full transition-all duration-200"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex justify-between items-center text-[10.5px] text-[#71717A] font-mono leading-none px-0.5">
          <span>{hasDuration ? formatTime(media.position_ms) : "0:00"}</span>
          <span>{hasDuration ? formatTime(media.duration_ms) : "--:--"}</span>
        </div>
      </div>

      {/* 3. Playback Controls */}
      <div className="flex items-center justify-center gap-5 w-full">
        {/* Previous Track */}
        <button
          type="button"
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            hasPlayer && media.can_go_previous !== false
              ? "text-[#A1A1AA] hover:text-white hover:bg-white/[0.06] active:scale-95 cursor-pointer"
              : "text-[#52525B] cursor-not-allowed opacity-30"
          }`}
          disabled={!hasPlayer || media.can_go_previous === false}
          onClick={(e) => {
            e.stopPropagation();
            onPrevious();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Previous track"
          aria-label="Previous track"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="19 20 9 12 19 4 19 20" />
            <line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>

        {/* Primary Action: Play/Pause */}
        <button
          type="button"
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${
            hasPlayer
              ? "bg-[#F5F5F5] text-[#080808] hover:bg-white hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
              : "bg-[#141414] text-[#52525B] cursor-not-allowed opacity-40"
          }`}
          disabled={!hasPlayer}
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlayPause();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title={isPlaying ? "Pause" : "Play"}
          aria-label={isPlaying ? "Pause playback" : "Start playback"}
        >
          {isPlaying ? (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" className="translate-x-[0.5px]">
              <polygon points="6 4 20 12 6 20 6 4" />
            </svg>
          )}
        </button>

        {/* Next Track */}
        <button
          type="button"
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            hasPlayer && media.can_go_next !== false
              ? "text-[#A1A1AA] hover:text-white hover:bg-white/[0.06] active:scale-95 cursor-pointer"
              : "text-[#52525B] cursor-not-allowed opacity-30"
          }`}
          disabled={!hasPlayer || media.can_go_next === false}
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Next track"
          aria-label="Next track"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 4 15 12 5 20 5 4" />
            <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.5" />
          </svg>
        </button>
      </div>
    </div>
  );
};

