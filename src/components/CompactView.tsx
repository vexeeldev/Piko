import React from "react";
import { MediaInfo } from "../types";

interface CompactViewProps {
  media: MediaInfo;
}

export const CompactView: React.FC<CompactViewProps> = ({ media }) => {
  const isPlaying = media.playback_status.toLowerCase() === "playing";
  const isPaused = media.playback_status.toLowerCase() === "paused";

  const statusLabel = isPlaying
    ? "Now Playing"
    : isPaused
    ? "Paused"
    : "No Playback";

  return (
    <div className="flex items-center justify-between w-full h-[56px] px-4 select-none text-[#F5F5F5]">
      {/* Left: Minimal Monochrome Music Icon & Status Label */}
      <div className="flex items-center gap-2.5 min-w-0">
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-colors duration-200 ${
            isPlaying ? "text-[#F5F5F5]" : "text-[#71717A]"
          }`}
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
        <span
          className={`text-[12.5px] font-medium tracking-tight truncate transition-colors duration-200 ${
            isPlaying ? "text-[#F5F5F5]" : isPaused ? "text-[#A1A1AA]" : "text-[#71717A]"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      {/* Right: Waveform Visualization (Monochrome, animated when playing, subdued static when paused/idle) */}
      <div
        className="flex items-center gap-[2.5px] h-3.5 flex-shrink-0"
        aria-hidden="true"
      >
        <span
          className={`w-[2px] rounded-full transition-all duration-300 ${
            isPlaying
              ? "h-[14px] bg-[#F5F5F5] animate-wave-1"
              : isPaused
              ? "h-[6px] bg-[#71717A]"
              : "h-[3px] bg-[#3F3F46]"
          }`}
        />
        <span
          className={`w-[2px] rounded-full transition-all duration-300 ${
            isPlaying
              ? "h-[14px] bg-[#F5F5F5] animate-wave-2"
              : isPaused
              ? "h-[12px] bg-[#71717A]"
              : "h-[3px] bg-[#3F3F46]"
          }`}
        />
        <span
          className={`w-[2px] rounded-full transition-all duration-300 ${
            isPlaying
              ? "h-[14px] bg-[#F5F5F5] animate-wave-3"
              : isPaused
              ? "h-[8px] bg-[#71717A]"
              : "h-[3px] bg-[#3F3F46]"
          }`}
        />
        <span
          className={`w-[2px] rounded-full transition-all duration-300 ${
            isPlaying
              ? "h-[14px] bg-[#F5F5F5] animate-wave-4"
              : isPaused
              ? "h-[10px] bg-[#71717A]"
              : "h-[3px] bg-[#3F3F46]"
          }`}
        />
      </div>
    </div>
  );
};

