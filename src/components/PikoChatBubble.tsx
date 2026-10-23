import React from "react";

export interface PikoChatBubbleProps {
  message: string | null;
  isSpeaking: boolean;
  targetX: number;
  onDismiss?: () => void;
}

export const PikoChatBubble: React.FC<PikoChatBubbleProps> = ({
  message,
  isSpeaking,
  targetX,
  onDismiss,
}) => {
  if (!message) return null;

  // Compute bubble placement based on Piko's horizontal target position
  // targetX ranges from -112px to +112px:
  // If Piko is on the left (targetX <= 0): place bubble to his right
  // If Piko is on the right (targetX > 0): place bubble to his left
  const isPikoOnLeft = targetX <= 0;

  return (
    <div
      className="absolute top-1 pointer-events-auto z-30 transition-all duration-300 ease-[cubic-bezier(0.34,1.4,0.64,1)] animate-in fade-in zoom-in-95"
      style={{
        // Dynamic horizontal anchor preventing overflow beyond container bounds
        left: isPikoOnLeft
          ? `calc(50% + ${Math.max(-10, targetX + 55)}px)`
          : undefined,
        right: !isPikoOnLeft
          ? `calc(50% - ${Math.min(10, targetX - 55)}px)`
          : undefined,
        maxWidth: "220px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex flex-col bg-[#16161c]/94 backdrop-blur-xl border border-white/20 text-white rounded-[16px] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.65)] ring-1 ring-white/10">
        {/* Header row: Piko label & Speaking animated wave */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5">
            {isSpeaking ? (
              <span className="flex items-center gap-0.5" title="Piko Speaking">
                <span className="w-0.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" />
                <span className="w-0.5 h-3.5 bg-cyan-400 rounded-full animate-pulse delay-75" />
                <span className="w-0.5 h-2 bg-cyan-400 rounded-full animate-pulse delay-150" />
              </span>
            ) : (
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            )}
            <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              Piko
            </span>
          </div>

          {/* Dismiss button */}
          {onDismiss && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss();
              }}
              className="text-white/40 hover:text-white text-xs leading-none cursor-pointer p-0.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Tutup pesan"
            >
              ×
            </button>
          )}
        </div>

        {/* Message Content */}
        <p className="text-[11.5px] font-medium leading-snug text-white/95 select-none m-0">
          {message}
        </p>

        {/* Speech Bubble Arrow Tail */}
        <div
          className="absolute -bottom-1.5 w-3 h-3 bg-[#16161c] border-b border-r border-white/20 rotate-45 pointer-events-none"
          style={{
            left: isPikoOnLeft ? "18px" : undefined,
            right: !isPikoOnLeft ? "18px" : undefined,
          }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

