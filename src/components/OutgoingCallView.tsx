import React, { useState } from "react";
import { CallInfo } from "../types";

interface OutgoingCallViewProps {
  call: CallInfo;
  onEndCall: () => void;
}

export const OutgoingCallView: React.FC<OutgoingCallViewProps> = ({
  call,
  onEndCall,
}) => {
  const [avatarError, setAvatarError] = useState(false);

  const providerLabel =
    call.provider === "whatsapp-web"
      ? "WhatsApp"
      : call.provider === "whatsapp-desktop"
      ? "WhatsApp Desktop"
      : "Telegram";

  const contactDisplayName = call.contactName?.trim() || "Outgoing Call";
  const initialLetter = contactDisplayName.charAt(0).toUpperCase();

  const isEnding = call.state === "ending";

  // Truthful status label derived strictly from call state
  const statusLabel =
    call.state === "incoming" || call.state === "answering"
      ? "Connecting..."
      : call.state === "active"
      ? "Connected"
      : "Calling...";

  return (
    <div
      className="flex flex-col justify-between w-full h-[196px] px-5 py-4 select-none text-[#F5F5F5] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Section: Recipient Avatar & Status */}
      <div className="flex items-center w-full min-w-0 pt-1">
        {/* Recipient Avatar */}
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

          {/* Outgoing Call Ringing Animation */}
          <span className="absolute inset-0 rounded-full border border-sky-400/40 animate-ping pointer-events-none" />
        </div>

        {/* Contact Name & Truthful Outgoing Status */}
        <div className="flex flex-col min-w-0 flex-1 justify-center pl-3.5">
          <span className="text-[16px] font-semibold text-[#F5F5F5] truncate leading-snug tracking-tight">
            {contactDisplayName}
          </span>

          <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-[#A1A1AA]">
            <span className="font-medium text-[#D4D4D8]">{providerLabel}</span>
            <span className="text-[#52525B]">·</span>
            <span className="text-sky-400 font-medium">{statusLabel}</span>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {call.error && (
        <div className="w-full px-2.5 py-1 rounded bg-red-950/60 border border-red-500/30 text-red-300 text-[11px] truncate">
          {call.error}
        </div>
      )}

      {/* Bottom Section: Red Cancel/End Call Button */}
      <div className="flex items-center justify-center w-full pt-1">
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

