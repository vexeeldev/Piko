import React, { useState, useRef, useEffect } from "react";
import { RobotHead, RobotHeadState } from "robot-heads";
import { ActiveView, MediaInfo, BatteryInfo, CallInfo, SystemStats } from "../types";

interface HomeMenuProps {
  currentView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  media: MediaInfo;
  battery: BatteryInfo;
  filesCount: number;
  call: CallInfo | null;
  stats?: SystemStats;
}

const ROBOT_MOODS: RobotHeadState[] = [
  "idle",
  "happy",
  "thinking",
  "searching",
  "listening",
  "speaking",
  "working",
  "error",
  "sleeping",
];

interface GazeTarget {
  name: string;
  dx: number;
  dy: number;
  dwell: number;
}

// Autonomous gaze points: kanan (menu), kiri, atas, bawah, diagonal, depan
const AUTONOMOUS_GAZE_TARGETS: GazeTarget[] = [
  { name: "kanan (lihat menu)", dx: 180, dy: 10, dwell: 2600 },
  { name: "kanan-atas", dx: 150, dy: -80, dwell: 2000 },
  { name: "depan (tatap user)", dx: 0, dy: 0, dwell: 2500 },
  { name: "kiri", dx: -160, dy: 0, dwell: 2200 },
  { name: "atas (tengadah)", dx: 0, dy: -130, dwell: 2100 },
  { name: "bawah (tunduk)", dx: 0, dy: 110, dwell: 1900 },
  { name: "kiri-atas", dx: -130, dy: -70, dwell: 1800 },
  { name: "kanan-bawah", dx: 160, dy: 80, dwell: 2200 },
  { name: "depan", dx: 0, dy: 0, dwell: 2800 },
];

type RobotPosition = "left" | "center" | "right";
const POSITION_CYCLE: RobotPosition[] = ["left", "center", "right", "center"];

// Persistent state across view changes / drag-cancel
let persistentHomePosIndex = 0;
let persistentHomeMoodIndex = 0;

export const HomeMenu: React.FC<HomeMenuProps> = ({
  currentView,
  onSelectView,
  media,
  battery,
  filesCount,
  call,
  stats,
}) => {
  const [moodIndex, setMoodIndex] = useState(persistentHomeMoodIndex);
  const [hopY, setHopY] = useState(0);
  const [posIndex, setPosIndex] = useState(persistentHomePosIndex);
  const currentPos = POSITION_CYCLE[posIndex];
  const robotSideRef = useRef<RobotPosition>(currentPos);
  robotSideRef.current = currentPos;

  // Keep persistent state in sync
  useEffect(() => {
    persistentHomePosIndex = posIndex;
  }, [posIndex]);

  useEffect(() => {
    persistentHomeMoodIndex = moodIndex;
  }, [moodIndex]);

  const hopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const robotContainerRef = useRef<HTMLDivElement>(null);
  const groupARef = useRef<HTMLDivElement>(null);
  const groupBRef = useRef<HTMLDivElement>(null);
  const isHoveringGridRef = useRef(false);
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 75, y: 70 });

  const isMusicPlaying = media.playback_status.toLowerCase() === "playing";
  const hasActiveCall = Boolean(call && call.state !== "idle" && call.state !== "ended");
  const currentMood = ROBOT_MOODS[moodIndex];
  const volume = stats?.volume ?? 70;

  // Naturally cycle through all 9 expressions every 3.5 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setMoodIndex((prev) => (prev + 1) % ROBOT_MOODS.length);
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  // Playful position swap: alternates Left -> Center (splits 2 & 2) -> Right -> Center -> Left
  useEffect(() => {
    const swapTimer = setInterval(() => {
      // Don't swap if user is actively hovering over menu buttons (prevents misclicks)
      if (isHoveringGridRef.current) return;

      setPosIndex((prev) => (prev + 1) % POSITION_CYCLE.length);
      // Cute hop when swapping positions
      setHopY(-10);
      setTimeout(() => setHopY(0), 320);
    }, 3000); // Swaps every 5s

    return () => clearInterval(swapTimer);
  }, []);

  // Autonomous looking around (noleh kanan, kiri, atas, bawah, depan sendiri)
  useEffect(() => {
    let isCancelled = false;
    let animFrameId: number | null = null;
    let dwellTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let targetIndex = 0;
    let lastUserMoveTime = 0;

    const getRobotCenter = () => {
      if (robotContainerRef.current) {
        const rect = robotContainerRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }
      }
      return { x: 75, y: 70 };
    };

    // Track user's actual mouse movement - when user moves mouse, pause autonomous gazing
    const handleUserPointerMove = (e: PointerEvent) => {
      if (e.isTrusted) {
        lastUserMoveTime = Date.now();
        currentPosRef.current = { x: e.clientX, y: e.clientY };
      }
    };

    window.addEventListener("pointermove", handleUserPointerMove, { passive: true });

    // Transition smoothly to target position
    const animateToTarget = (targetX: number, targetY: number, dwellTime: number) => {
      if (isCancelled) return;
      const startX = currentPosRef.current.x;
      const startY = currentPosRef.current.y;
      const duration = 280; // ms for smooth gaze shift
      const startTime = performance.now();

      const step = (now: number) => {
        if (isCancelled) return;

        // If user actively moved mouse in the last 1.8s, yield control to the user
        if (Date.now() - lastUserMoveTime < 1800) {
          dwellTimeoutId = setTimeout(scheduleNextGaze, 1000);
          return;
        }

        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Smooth ease-out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const curX = startX + (targetX - startX) * ease;
        const curY = startY + (targetY - startY) * ease;

        currentPosRef.current = { x: curX, y: curY };

        document.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: curX,
            clientY: curY,
            bubbles: true,
          })
        );

        if (progress < 1) {
          animFrameId = requestAnimationFrame(step);
        } else {
          // Reached target direction, pause/dwell here naturally
          dwellTimeoutId = setTimeout(scheduleNextGaze, dwellTime);
        }
      };

      animFrameId = requestAnimationFrame(step);
    };

    const scheduleNextGaze = () => {
      if (isCancelled) return;
      const center = getRobotCenter();
      const target = AUTONOMOUS_GAZE_TARGETS[targetIndex];
      targetIndex = (targetIndex + 1) % AUTONOMOUS_GAZE_TARGETS.length;

      // Invert horizontal gaze offset when robot is on the right side so it looks at the buttons
      const xSign = robotSideRef.current === "right" ? -1 : 1;
      animateToTarget(center.x + target.dx * xSign, center.y + target.dy, target.dwell);
    };

    // Initial slight delay before starting autonomous wandering gaze
    dwellTimeoutId = setTimeout(scheduleNextGaze, 600);

    return () => {
      isCancelled = true;
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (dwellTimeoutId) clearTimeout(dwellTimeoutId);
      window.removeEventListener("pointermove", handleUserPointerMove);
    };
  }, []);

  const handleRobotClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hopTimerRef.current) clearTimeout(hopTimerRef.current);
    setHopY(-8);
    setMoodIndex((prev) => (prev + 1) % ROBOT_MOODS.length);
    hopTimerRef.current = setTimeout(() => {
      setHopY(0);
    }, 300);

    // Make robot face forward towards the user when clicked
    if (robotContainerRef.current) {
      const rect = robotContainerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      currentPosRef.current = { x: cx, y: cy };
      document.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: cx,
          clientY: cy,
          bubbles: true,
        })
      );
    }
  };

  const items = [
    {
      id: "music" as ActiveView,
      title: "Music",
      subtitle: isMusicPlaying
        ? (media.title || "Playing")
        : media.has_player
        ? (media.title || "Paused")
        : "MPRIS Player",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
      ),
      badge: isMusicPlaying ? (
        <span className="flex items-center gap-0.5" title="Playing">
          <span className="w-1 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
          <span className="w-1 h-3.5 bg-emerald-400 rounded-full animate-pulse delay-75" />
          <span className="w-1 h-2 bg-emerald-400 rounded-full animate-pulse delay-150" />
        </span>
      ) : null,
    },
    {
      id: "files" as ActiveView,
      title: "File Dock",
      subtitle: filesCount === 0 ? "Empty dock" : `${filesCount} file${filesCount === 1 ? "" : "s"}`,
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
      ),
      badge: filesCount > 0 ? (
        <span className="px-1.5 py-0.5 rounded-full bg-white/10 text-[9.5px] font-mono font-medium text-white/90">
          {filesCount}
        </span>
      ) : null,
    },
    {
      id: "calls" as ActiveView,
      title: "Calls",
      subtitle: hasActiveCall
        ? (call?.contactName || "Active Call")
        : "WhatsApp",
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
      ),
      badge: hasActiveCall ? (
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
      ) : null,
    },
    {
      id: "system" as ActiveView,
      title: "System",
      subtitle: `${volume}% Vol • ${battery.has_battery ? `${battery.percentage}%` : "AC"}`,
      icon: (
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect width="16" height="10" x="2" y="7" rx="2" ry="2" />
          <line x1="22" x2="22" y1="11" y2="13" />
        </svg>
      ),
      badge: battery.is_charging ? (
        <span className="text-[10px] text-amber-400 font-bold leading-none animate-pulse">⚡</span>
      ) : null,
    },
  ];

  // Layout measurements for 3 positions: "left" | "center" | "right"
  const gap = 8;
  const colWidth = groupARef.current?.offsetWidth || 150;
  const robWidth = robotContainerRef.current?.offsetWidth || 120;
  const deltaRobot = colWidth + gap;
  const deltaGroup = robWidth + gap;

  let robotTranslateX = 0;
  let groupATranslateX = 0;
  let groupBTranslateX = 0;

  if (currentPos === "left") {
    robotTranslateX = -deltaRobot;
    groupATranslateX = +deltaGroup;
    groupBTranslateX = 0;
  } else if (currentPos === "right") {
    robotTranslateX = +deltaRobot;
    groupATranslateX = 0;
    groupBTranslateX = -deltaGroup;
  } else {
    // "center": Robot in center, 2 buttons on left, 2 buttons on right!
    robotTranslateX = 0;
    groupATranslateX = 0;
    groupBTranslateX = 0;
  }

  const renderItemButton = (item: (typeof items)[0]) => {
    const isCurrent = currentView === item.id;
    return (
      <button
        key={item.id}
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          onSelectView(item.id);
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex items-center justify-between p-2 rounded-[12px] border text-left transition-all duration-150 cursor-pointer h-[58px] ${
          isCurrent
            ? "bg-white/[0.14] border-white/30 shadow-sm"
            : "bg-[#141417]/70 border-white/[0.08] hover:bg-white/[0.08] hover:border-white/[0.18] active:scale-[0.98]"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-[8px] flex items-center justify-center flex-shrink-0 transition-colors ${
              isCurrent
                ? "bg-white text-black"
                : "bg-white/[0.08] text-[#F5F5F5]"
            }`}
          >
            {item.icon}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[12.5px] font-semibold text-white tracking-tight leading-snug">
              {item.title}
            </span>
            <span className="text-[10px] text-[#A1A1AA] truncate leading-tight mt-0.5">
              {item.subtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center flex-shrink-0 pl-1">
          {item.badge}
        </div>
      </button>
    );
  };

  return (
    <div
      className="flex items-center gap-2 w-full h-[128px] select-none text-[#F5F5F5] relative overflow-hidden"
      role="menu"
      aria-label="Dynamic Island Home Menu"
    >
      {/* =========================================================================
          Group A: 2 Menu Buttons (Music, File Dock)
          ========================================================================= */}
      <div
        ref={groupARef}
        onPointerEnter={() => {
          isHoveringGridRef.current = true;
        }}
        onPointerLeave={() => {
          isHoveringGridRef.current = false;
        }}
        style={{
          transform: `translateX(${groupATranslateX}px)`,
          transition: "transform 0.65s cubic-bezier(0.34, 1.25, 0.64, 1)",
        }}
        className="relative z-0 flex flex-col gap-2 flex-1 min-w-0 h-full justify-between"
      >
        {items.slice(0, 2).map(renderItemButton)}
      </div>

      {/* =========================================================================
          Robot Companion (Can animate Left, Center, or Right)
          Always in front of buttons (z-10)
          ========================================================================= */}
      <div
        ref={robotContainerRef}
        onClick={handleRobotClick}
        className="relative z-10 flex items-center justify-center cursor-pointer flex-shrink-0 w-[120px] h-full"
        style={{
          transform: `translate(${robotTranslateX}px, ${hopY}px)`,
          transition: "transform 0.65s cubic-bezier(0.34, 1.25, 0.64, 1)",
        }}
        title={`Piko: ${currentMood} (Click to interact!)`}
      >
        <RobotHead
          size={112}
          shape="circle"
          state={currentMood}
          interactive={true}
          antenna={true}
          floorShadow={true}
          screenColor="#67e8f9"
        />
      </div>

      {/* =========================================================================
          Group B: 2 Menu Buttons (Call, System)
          ========================================================================= */}
      <div
        ref={groupBRef}
        onPointerEnter={() => {
          isHoveringGridRef.current = true;
        }}
        onPointerLeave={() => {
          isHoveringGridRef.current = false;
        }}
        style={{
          transform: `translateX(${groupBTranslateX}px)`,
          transition: "transform 0.65s cubic-bezier(0.34, 1.25, 0.64, 1)",
        }}
        className="relative z-0 flex flex-col gap-2 flex-1 min-w-0 h-full justify-between"
      >
        {items.slice(2, 4).map(renderItemButton)}
      </div>
    </div>
  );
};
