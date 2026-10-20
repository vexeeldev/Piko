import React, { useState, useEffect, useRef } from "react";
import { RobotHead, RobotHeadState } from "robot-heads";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { MediaInfo, BatteryInfo, SystemStats, CallInfo } from "../types";

interface CompanionViewProps {
  media?: MediaInfo;
  battery?: BatteryInfo;
  stats?: SystemStats;
  call?: CallInfo | null;
}

interface CursorPos {
  screen_x: number;
  screen_y: number;
  client_x: number;
  client_y: number;
}

const ALL_EXPRESSIONS: RobotHeadState[] = [
  "idle",
  "thinking",
  "searching",
  "listening",
  "speaking",
  "working",
  "happy",
  "error",
  "sleeping",
];

// Clean horizontal wander positions when idle (adjusted for larger size)
const WANDER_OFFSETS = [0, -112, 0, 112, -112, 112];

// Persistent state across view changes / drag-cancel
let persistentCompanionMoodIndex = 0;
let persistentCompanionWanderIndex = 0;
let persistentCompanionTargetX = 0;

export const CompanionView: React.FC<CompanionViewProps> = () => {
  const [moodIndex, setMoodIndex] = useState<number>(persistentCompanionMoodIndex);
  const [wanderIndex, setWanderIndex] = useState<number>(persistentCompanionWanderIndex);
  const [hopY, setHopY] = useState<number>(0);
  const [isTrackingMouse, setIsTrackingMouse] = useState<boolean>(false);
  const [mouseTargetX, setMouseTargetX] = useState<number>(persistentCompanionTargetX);

  const containerRef = useRef<HTMLDivElement>(null);
  const mouseIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep persistent state in sync
  useEffect(() => {
    persistentCompanionMoodIndex = moodIndex;
  }, [moodIndex]);

  useEffect(() => {
    persistentCompanionWanderIndex = wanderIndex;
  }, [wanderIndex]);

  useEffect(() => {
    persistentCompanionTargetX = mouseTargetX;
  }, [mouseTargetX]);

  // Helper to update robot target position when cursor moves
  const handleCursorMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const relX = clientX - centerX;

    // Smoothly map screen-wide cursor X to robot range [-112px, 112px]
    const clampedX = Math.round(Math.max(-112, Math.min(112, relX * 0.35)));

    setMouseTargetX(clampedX);
    persistentCompanionTargetX = clampedX;
    setIsTrackingMouse(true);

    // If mouse stops moving anywhere for 1.8s, return to normal autonomous mode
    if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
    mouseIdleTimerRef.current = setTimeout(() => {
      setIsTrackingMouse(false);
    }, 1800);
  };

  // Global & local mouse movement tracking (inside window AND across entire desktop)
  useEffect(() => {
    // 1. Direct local window listener for instant 60fps tracking inside Dynamic Island
    const handleLocalPointerMove = (e: PointerEvent) => {
      handleCursorMove(e.clientX);
    };

    window.addEventListener("pointermove", handleLocalPointerMove);

    // 2. Global desktop cursor tracking via Tauri backend (detects mouse anywhere on screen)
    let isCancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let lastScreenX = -1;
    let lastScreenY = -1;

    if (isTauri()) {
      pollInterval = setInterval(async () => {
        if (isCancelled) return;
        try {
          const pos = await invoke<CursorPos | null>("get_global_cursor_position");
          if (pos && !isCancelled) {
            const dx = pos.screen_x - lastScreenX;
            const dy = pos.screen_y - lastScreenY;
            // Only update when mouse actually moves on the monitor
            if (Math.hypot(dx, dy) >= 1.5) {
              lastScreenX = pos.screen_x;
              lastScreenY = pos.screen_y;

              // Dispatch synthetic PointerEvent so robot-heads' internal gaze engine looks at cursor
              document.dispatchEvent(
                new PointerEvent("pointermove", {
                  clientX: pos.client_x,
                  clientY: pos.client_y,
                  bubbles: true,
                })
              );

              handleCursorMove(pos.client_x);
            }
          }
        } catch {
          // ignore if backend call fails
        }
      }, 45); // ~22 FPS lightweight polling
    }

    return () => {
      isCancelled = true;
      if (pollInterval) clearInterval(pollInterval);
      window.removeEventListener("pointermove", handleLocalPointerMove);
      if (mouseIdleTimerRef.current) clearTimeout(mouseIdleTimerRef.current);
    };
  }, []);

  // Auto-cycle through ALL 9 expressions AND wander between waypoints (active when mouse is silent/idle)
  useEffect(() => {
    if (isTrackingMouse) return;

    const interval = setInterval(() => {
      setMoodIndex((prev) => {
        const next = (prev + 1) % ALL_EXPRESSIONS.length;
        persistentCompanionMoodIndex = next;
        return next;
      });
      setWanderIndex((prev) => {
        const next = (prev + 1) % WANDER_OFFSETS.length;
        persistentCompanionWanderIndex = next;
        return next;
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isTrackingMouse]);

  // Clicking the robot: triggers a bounce and advances expression
  const handleRobotClick = () => {
    if (hopTimerRef.current) clearTimeout(hopTimerRef.current);
    setHopY(-12);

    // Switch to next expression
    setMoodIndex((prev) => {
      const next = (prev + 1) % ALL_EXPRESSIONS.length;
      persistentCompanionMoodIndex = next;
      return next;
    });

    hopTimerRef.current = setTimeout(() => {
      setHopY(0);
    }, 350);
  };

  // When tracking mouse: stay attentive in 'idle' looking at cursor; otherwise cycle all 9 moods
  const currentMood = isTrackingMouse ? "idle" : ALL_EXPRESSIONS[moodIndex];
  const targetX = isTrackingMouse ? mouseTargetX : WANDER_OFFSETS[wanderIndex];

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center w-full h-full select-none"
    >
      {/* 
        Hardware-accelerated translation wrapper:
        - When tracking mouse: responsive 400ms spring glide directly to cursor position
        - When idle: smooth 1200ms slow wandering glide
      */}
      <div
        className={`cursor-pointer transition-transform ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isTrackingMouse ? "duration-[400ms]" : "duration-[1200ms]"
        }`}
        style={{
          transform: `translate3d(${targetX}px, ${hopY}px, 0)`,
          willChange: "transform",
          backfaceVisibility: "hidden",
          WebkitBackfaceVisibility: "hidden",
        }}
        onClick={handleRobotClick}
        title={
          isTrackingMouse
            ? "Following cursor across screen"
            : `Expression: ${currentMood} (Click to switch!)`
        }
      >
        <RobotHead
          size={142}
          shape="circle"
          state={currentMood}
          interactive={true}
          antenna={true}
          floorShadow={true}
          screenColor="#67e8f9"
        />
      </div>
    </div>
  );
};
