import React, { useState } from "react";
import { CallInfo } from "../types";

interface IncomingCallViewProps {
  call: CallInfo;
  onAnswer: () => void;
  onDecline: () => void;
  onToggleMute?: () => void;
}

export const IncomingCallView: React.FC<IncomingCallViewProps> = ({
  call,
  onAnswer,
  onDecline,
}) => {
  const [avatarError, setAvatarError] = useState(false);

  const isAnswering = call.state === "answering";
  const contactDisplayName = call.contactName?.trim() || "Unknown Caller";
  const initialLetter = contactDisplayName.charAt(0).toUpperCase();

  return (
    <div
      className="flex flex-col justify-between w-full h-[196px] px-7 pt-4 pb-3.5 select-none text-[#F5F5F5] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Top Header Section: Caller info on Left, Glowing Avatar on Right */}
      <div className="flex items-center justify-between w-full min-w-0">
        {/* Left Side: Contact Name & Subtitle */}
        <div className="flex flex-col items-start min-w-0 pr-4">
          <span className="text-[22px] font-bold text-white tracking-tight leading-tight truncate max-w-[280px]">
            {contactDisplayName}
          </span>
          <span className="text-[13px] text-[#A1A1AA] font-normal mt-0.5 tracking-normal">
            Incoming call
          </span>
        </div>

        <div className="relative flex-shrink-0">
          <div className="w-[64px] h-[64px] rounded-full overflow-hidden bg-[#181818] flex items-center justify-center shadow-lg">
            {call.avatarUrl && !avatarError ? (
              <img
                src={call.avatarUrl}
                alt={contactDisplayName}
                className="w-full h-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-[#1E293B] to-[#334155] text-white font-bold text-[24px]">
                {initialLetter}
              </div>
            )}
          </div>

          {/* Provider Badge Icon at bottom-right corner */}
          <div className="absolute -bottom-0.5 -right-0.5 w-[20px] h-[20px] rounded-full bg-[#080808] border border-white/[0.2] flex items-center justify-center shadow-md">
            {call.provider.startsWith("whatsapp") ? (
              <svg
                className="w-3 h-3 text-[#22C55E]"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.79 14.15c-.24.68-1.39 1.29-1.93 1.38-.49.08-1.12.12-3.23-.75-2.7-1.12-4.43-3.87-4.57-4.05-.13-.18-1.1-1.46-1.1-2.79 0-1.33.7-1.98.94-2.25.25-.26.54-.33.72-.33.18 0 .36 0 .52.01.17.01.4.06.6.53.22.52.75 1.83.82 1.96.07.14.11.3.02.48-.09.18-.14.29-.27.45-.14.16-.29.35-.41.47-.14.13-.28.28-.12.56.16.27.7 1.15 1.5 1.86 1.03.92 1.9 1.2 2.17 1.34.27.13.43.11.59-.07.16-.18.69-.8 87-1.08.18-.28.36-.23.6-.14.24.09 1.52.72 1.78.85.26.13.43.2.49.31.06.11.06.66-.18 1.34z" />
              </svg>
            ) : (
              <svg
                className="w-3 h-3 text-[#38BDF8]"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.19-.08-.05-.19-.02-.27 0-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.75 4-1.74 6.68-2.88 8.03-3.44 3.83-1.6 4.62-1.88 5.14-1.89.11 0 .37.03.54.17.14.12.18.28.2.45-.01.07-.02.21-.04.38z" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Error state if an answer or decline action failed */}
      {call.error && (
        <div className="w-full px-2.5 py-0.5 rounded bg-red-950/60 border border-red-500/30 text-red-300 text-[11px] text-center truncate">
          {call.error}
        </div>
      )}

      {/* Bottom Section: 2 Centered Action Buttons (Decline & Accept) */}
      <div className="flex items-center justify-center gap-16 w-full mt-auto">
        {/* 1. Decline Button (Red) */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            data-no-drag="true"
            disabled={isAnswering}
            onClick={(e) => {
              e.stopPropagation();
              onDecline();
            }}
            title="Decline call"
            aria-label="Decline incoming call"
            className="w-[48px] h-[48px] rounded-full bg-[#EF4444] hover:bg-[#DC2626] active:scale-95 text-white flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(239,68,68,0.4)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <svg
              className="w-5 h-5 rotate-[135deg] transition-transform duration-200 group-hover:scale-110"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
            </svg>
          </button>
          <span className="text-[12px] font-medium text-[#A1A1AA] select-none tracking-wide">
            Decline
          </span>
        </div>

        {/* 2. Accept Button (Green) */}
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            data-no-drag="true"
            disabled={isAnswering}
            onClick={(e) => {
              e.stopPropagation();
              onAnswer();
            }}
            title="Accept call"
            aria-label="Accept incoming call"
            className="w-[48px] h-[48px] rounded-full bg-[#22C55E] hover:bg-[#16A34A] active:scale-95 text-white flex items-center justify-center transition-all duration-200 shadow-[0_4px_16px_rgba(34,197,94,0.4)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            {isAnswering ? (
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
                className="w-5 h-5 transition-transform duration-200 group-hover:scale-110"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
              </svg>
            )}
          </button>
          <span className="text-[12px] font-medium text-[#A1A1AA] select-none tracking-wide">
            {isAnswering ? "Connecting..." : "Accept"}
          </span>
        </div>
      </div>
    </div>
  );
};
