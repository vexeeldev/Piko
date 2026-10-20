import React, { useState, useRef, useEffect, useCallback } from "react";

interface SwipeAnswerSliderProps {
  onAnswer: () => void;
  disabled?: boolean;
  isAnswering?: boolean;
}

export const SwipeAnswerSlider: React.FC<SwipeAnswerSliderProps> = ({
  onAnswer,
  disabled = false,
  isAnswering = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLButtonElement>(null);

  const [dragX, setDragX] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [maxTravel, setMaxTravel] = useState<number>(160);

  const startXRef = useRef<number>(0);
  const currentXRef = useRef<number>(0);
  const pointerIdRef = useRef<number | null>(null);

  // Measure available travel: track width minus thumb width and padding
  const updateTravelDistance = useCallback(() => {
    if (trackRef.current && thumbRef.current) {
      const trackWidth = trackRef.current.clientWidth;
      const thumbWidth = thumbRef.current.offsetWidth;
      // 3px padding on each side
      const travel = Math.max(0, trackWidth - thumbWidth - 6);
      setMaxTravel(travel);
    }
  }, []);

  useEffect(() => {
    updateTravelDistance();
    window.addEventListener("resize", updateTravelDistance);
    return () => window.removeEventListener("resize", updateTravelDistance);
  }, [updateTravelDistance]);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || isAnswering || e.button !== 0) return;
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerIdRef.current = e.pointerId;
    } catch {
      // Fallback if pointer capture is not supported
    }

    startXRef.current = e.clientX;
    currentXRef.current = 0;
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;
    e.stopPropagation();

    const deltaX = e.clientX - startXRef.current;
    // Strictly clamp between 0 (LEFT) and maxTravel (RIGHT) — NO moving left
    const clamped = Math.max(0, Math.min(deltaX, maxTravel));
    currentXRef.current = clamped;
    setDragX(clamped);
  };

  const handleEndDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;
    e.stopPropagation();

    if (pointerIdRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(pointerIdRef.current);
      } catch {
        // Ignored
      }
      pointerIdRef.current = null;
    }

    setIsDragging(false);

    // Completion threshold: strictly 80% (0.8) of available travel
    const progress = maxTravel > 0 ? currentXRef.current / maxTravel : 0;
    if (progress >= 0.8) {
      // Reached completion threshold: snap to end and invoke answer callback
      setDragX(maxTravel);
      onAnswer();
    } else {
      // Released early: spring-like snap back to start (0)
      setDragX(0);
      currentXRef.current = 0;
    }
  };

  // Keyboard accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || isAnswering) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setDragX(maxTravel);
      onAnswer();
    }
  };

  const progressPercent = maxTravel > 0 ? (dragX / maxTravel) * 100 : 0;

  return (
    <div
      ref={trackRef}
      data-no-drag="true"
      className="relative flex items-center h-[46px] flex-1 min-w-[180px] max-w-[240px] rounded-full bg-[#141414] border border-white/[0.08] select-none overflow-hidden"
      style={{ touchAction: "none" }}
    >
      {/* Dynamic green fill trail trailing the slider thumb */}
      <div
        className="absolute left-0 top-0 bottom-0 bg-[#22C55E]/20 rounded-full transition-none pointer-events-none"
        style={{ width: `${Math.max(0, dragX + 42)}px` }}
      />

      {/* Track Instruction Label (Fades out as user swipes right) */}
      <div
        className="absolute inset-0 flex items-center justify-center pl-8 pr-3 pointer-events-none transition-opacity duration-150"
        style={{ opacity: Math.max(0, 1 - progressPercent / 70) }}
      >
        <span className="text-[12px] font-medium text-[#A1A1AA] tracking-wide flex items-center gap-1">
          {isAnswering ? "Connecting..." : "Swipe to answer"}
          {!isAnswering && (
            <span className="text-[#71717A] tracking-tighter text-[13px] animate-pulse">
              ›››
            </span>
          )}
        </span>
      </div>

      {/* SWIPE THUMB: Green circular button starting strictly on the LEFT */}
      <button
        ref={thumbRef}
        type="button"
        data-no-drag="true"
        disabled={disabled || isAnswering}
        role="slider"
        aria-label="Swipe right to answer call"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progressPercent)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handleEndDrag}
        onPointerCancel={handleEndDrag}
        onKeyDown={handleKeyDown}
        className={`absolute left-[3px] top-[2.5px] w-[40px] h-[40px] rounded-full bg-[#22C55E] text-white flex items-center justify-center cursor-grab active:cursor-grabbing shadow-[0_2px_10px_rgba(34,197,94,0.35)] select-none z-10 ${
          isDragging
            ? "transition-none scale-105"
            : "transition-transform duration-300 ease-out"
        } ${isAnswering ? "animate-pulse cursor-wait" : ""}`}
        style={{
          transform: `translateX(${dragX}px)`,
        }}
      >
        {isAnswering ? (
          /* Connecting spinner */
          <svg
            className="animate-spin w-4 h-4 text-white"
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
          /* Clean phone answer icon */
          <svg
            className="w-4 h-4 translate-y-[0.5px]"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
          </svg>
        )}
      </button>
    </div>
  );
};

