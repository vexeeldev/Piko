import React, { useState, useEffect } from "react";
import { CallInfo } from "../types";

interface ActiveCallViewProps {
  call: CallInfo;
  onEndCall: () => void;
  onToggleMute?: () => void;
}

function formatCallDuration(startedAt?: number | null): string {
  if (!startedAt || startedAt <= 0) return "Connected";
  const now = Date.now();
  const elapsedSec = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(elapsedSec / 3600);
  const minutes = Math.floor((elapsedSec % 3600) / 60);
  const seconds = elapsedSec % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export const ActiveCallView: React.FC<ActiveCallViewProps> = ({
  call,
  onEndCall,
  onToggleMute,
}) => {
  const [avatarError, setAvatarError] = useState(false);
  const [durationText, setDurationText] = useState(() =>
    formatCallDuration(call.startedAt)
  );

  // Live timer update strictly if call.startedAt is confirmed
  useEffect(() => {
    if (!call.startedAt) {
      setDurationText("Connected");
      return;
    }

    const interval = setInterval(() => {
      setDurationText(formatCallDuration(call.startedAt));
    }, 1000);

    return () => clearInterval(interval);
  }, [call.startedAt]);

  const providerLabel =
    call.provider === "whatsapp-web"
      ? "WhatsApp"
      : call.provider === "whatsapp-desktop"
      ? "WhatsApp Desktop"
      : "Telegram";

  const contactDisplayName = call.contactName?.trim() || "Active Call";
  const initialLetter = contactDisplayName.charAt(0).toUpperCase();

  const isEnding = call.state === "ending";
  const canMute = call.capabilities.mute !== "unsupported";

  return (
    <div
      className="flex flex-col justify-between w-full h-[196px] px-5 py-4 select-none text-[#F5F5F5] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Section: Avatar, Contact & Confirmed Duration */}
      <div className="flex items-center w-full min-w-0 pt-1">
        {/* Contact Avatar */}
        <div className="relative w-[58px] h-[58px] rounded-full bg-[#181818] border border-white/[0.12] flex items-center justify-center flex-shrink-0 overflow-hidden shadow-md">
          {call.avatarUrl && !avatarError ? (
            <img
              src={call.avatarUrl}
              alt={contactDisplayName}
              className="w-full h-full object-cover rounded-full"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-[#1E293B] to-[#334155] text-white font-semibold text-[20px]">
              {initialLetter}
            </div>
          )}

          {/* Minimal Active Call Green Pulse Dot */}
          <span className="absolute bottom-0 right-0 w-3 h-3 bg-[#22C55E] border-2 border-[#080808] rounded-full" />
        </div>

        {/* Contact Name & Live Call Timer */}
        <div className="flex flex-col min-w-0 flex-1 justify-center pl-3.5">
          <span className="text-[16px] font-semibold text-[#F5F5F5] truncate leading-snug tracking-tight">
            {contactDisplayName}
          </span>

          <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-[#A1A1AA]">
            <span className="font-medium text-[#D4D4D8]">{providerLabel}</span>
            <span className="text-[#52525B]">·</span>
            {/* Live confirmed duration */}
            <span className="font-mono text-[#22C55E] font-medium">
              {durationText}
            </span>
          </div>
        </div>
      </div>

      {/* Error / Warning Notice if action failed */}
      {call.error && (
        <div className="w-full px-2.5 py-1 rounded bg-red-950/60 border border-red-500/30 text-red-300 text-[11px] truncate">
          {call.error}
        </div>
      )}

      {/* Bottom Section: Call Controls */}
      <div className="flex items-center justify-center gap-6 w-full pt-1">
        {/* Mute Button (Shown active only if real mute capability is supported) */}
        {canMute && onToggleMute && (
          <button
            type="button"
            data-no-drag="true"
            disabled={isEnding || call.capabilities.mute === "unverified"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMute();
            }}
            title={
              call.capabilities.mute === "unverified"
                ? "Mute capability unverified"
                : call.isMuted
                ? "Unmute microphone"
                : "Mute microphone"
            }
            aria-label={call.isMuted ? "Unmute" : "Mute"}
            className={`w-[44px] h-[44px] rounded-full flex items-center justify-center transition-all cursor-pointer ${
              call.isMuted
                ? "bg-white text-[#080808]"
                : "bg-[#181818] hover:bg-[#222222] text-[#A1A1AA] hover:text-white border border-white/[0.08]"
            } ${
              call.capabilities.mute === "unverified"
                ? "opacity-40 cursor-not-allowed"
                : ""
            }`}
          >
            {call.isMuted ? (
              /* Mic Off */
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z" />
              </svg>
            ) : (
              /* Mic On */
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>
        )}

        {/* End Call Button */}
        <button
          type="button"
          data-no-drag="true"
          disabled={isEnding}
          onClick={(e) => {
            e.stopPropagation();
            onEndCall();
          }}
          title="End Call"
          aria-label="End Call"
          className="w-[48px] h-[48px] rounded-full bg-[#EF4444] hover:bg-[#DC2626] active:scale-95 text-white flex items-center justify-center transition-all shadow-[0_2px_10px_rgba(239,68,68,0.4)] cursor-pointer disabled:opacity-50"
        >
          {isEnding ? (
            <svg
              className="animate-spin w-5 h-5 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5 rotate-[135deg]"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

