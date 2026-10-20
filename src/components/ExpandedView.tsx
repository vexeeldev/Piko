import React from "react";
import { MediaInfo, BatteryInfo, CallInfo, ActiveView, DockedFile, SystemStats } from "../types";
import { HomeMenu } from "./HomeMenu";
import { MusicView } from "./MusicView";
import { FileDockView } from "./FileDockView";
import { CallsView } from "./CallsView";
import { SystemView } from "./SystemView";
import { CompanionView } from "./CompanionView";

export interface ExpandedViewProps {
  media: MediaInfo;
  battery: BatteryInfo;
  isPinned: boolean;
  onTogglePin: () => void;
  onTogglePlayPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onSeek?: (positionMs: number) => void;
  // Navigation
  activeView: ActiveView;
  onSelectView: (view: ActiveView) => void;
  onToggleMenu: () => void;
  // File Dock
  files: DockedFile[];
  onAddFiles: (files: FileList | File[] | string[]) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onCopyPath: (path: string) => Promise<boolean>;
  // Calls
  call: CallInfo | null;
  onAnswerCall: () => void;
  onDeclineCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  // System / Control Center
  stats?: SystemStats;
  onSetVolume?: (volume: number) => void;
  onToggleSystemMute?: () => void;
}

const FEATURE_ORDER: ActiveView[] = ["music", "files", "calls", "system"];

export const ExpandedView: React.FC<ExpandedViewProps> = ({
  media,
  battery,
  isPinned,
  onTogglePin,
  onTogglePlayPause,
  onNext,
  onPrevious,
  onSeek,
  activeView,
  onSelectView,
  onToggleMenu,
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onCopyPath,
  call,
  onAnswerCall,
  onDeclineCall,
  onEndCall,
  onToggleMute,
  stats,
  onSetVolume,
  onToggleSystemMute,
}) => {
  const [trashDragPos, setTrashDragPos] = React.useState<{ x: number; y: number } | null>(null);
  const [hoveredDeleteFileId, setHoveredDeleteFileId] = React.useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const onRemoveFileRef = React.useRef(onRemoveFile);
  onRemoveFileRef.current = onRemoveFile;
  const hoveredFileIdRef = React.useRef<string | null>(null);

  const handleTrashPointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTrashDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  React.useEffect(() => {
    if (!trashDragPos) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setTrashDragPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest("[data-file-id]");
      const targetId = card?.getAttribute("data-file-id") || null;
      hoveredFileIdRef.current = targetId;
      setHoveredDeleteFileId(targetId);
    };

    const handlePointerUp = (e: PointerEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const card = el?.closest("[data-file-id]");
      const targetId = card?.getAttribute("data-file-id") || hoveredFileIdRef.current;
      if (targetId) {
        onRemoveFileRef.current(targetId);
      }
      hoveredFileIdRef.current = null;
      setTrashDragPos(null);
      setHoveredDeleteFileId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [trashDragPos !== null]);

  const handlePrevView = () => {
    const currentIndex = FEATURE_ORDER.indexOf(activeView);
    if (currentIndex === -1) {
      onSelectView(FEATURE_ORDER[FEATURE_ORDER.length - 1]);
    } else {
      const prevIndex = (currentIndex - 1 + FEATURE_ORDER.length) % FEATURE_ORDER.length;
      onSelectView(FEATURE_ORDER[prevIndex]);
    }
  };

  const handleNextView = () => {
    const currentIndex = FEATURE_ORDER.indexOf(activeView);
    if (currentIndex === -1) {
      onSelectView(FEATURE_ORDER[0]);
    } else {
      const nextIndex = (currentIndex + 1) % FEATURE_ORDER.length;
      onSelectView(FEATURE_ORDER[nextIndex]);
    }
  };

  // Keyboard navigation: Left/Right Arrow keys to cycle through menus
  React.useEffect(() => {
    const handleKeyNav = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowLeft") {
        handlePrevView();
      } else if (e.key === "ArrowRight") {
        handleNextView();
      }
    };
    window.addEventListener("keydown", handleKeyNav);
    return () => window.removeEventListener("keydown", handleKeyNav);
  }, [activeView]);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col justify-between w-full h-[196px] px-4 pt-3.5 pb-4 select-none text-[#F5F5F5] overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {/* =========================================================================
          1. Header Row: Home Icon Button + Center Indicator Dots + Battery & Pin
          ========================================================================= */}
      <div className="flex items-center justify-between w-full min-w-0 flex-shrink-0 z-20">
        {/* Left: Home Icon Button + Trash Drop Target when on File Dock */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-6 h-6 flex items-center justify-center cursor-pointer text-white/85 hover:text-white hover:scale-120 active:scale-90 transition-all duration-150 focus:outline-none"
            aria-label="Home"
            aria-pressed={activeView === "menu"}
          >
            {activeView === "menu" ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-white"
                aria-hidden="true"
              >
                <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
                <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
                aria-hidden="true"
              >
                <path d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
              </svg>
            )}
          </button>

          {/* Robot Companion Direct Button (Outline when inactive, Solid White Fill when active) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (activeView === "companion") {
                onSelectView("music");
              } else {
                onSelectView("companion");
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-6 h-6 flex items-center justify-center cursor-pointer text-white/85 hover:text-white hover:scale-120 active:scale-90 transition-all duration-150 focus:outline-none"
            title={activeView === "companion" ? "Exit Robot View" : "Open Robot Companion"}
            aria-label="Robot Companion"
            aria-pressed={activeView === "companion"}
          >
            {activeView === "companion" ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="text-white"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M12 2a1 1 0 0 1 1 1v1.07A6.002 6.002 0 0 1 18 10v.5h1a1.5 1.5 0 0 1 1.5 1.5v1a1.5 1.5 0 0 1-1.5 1.5H18v.5a6 6 0 0 1-6 6 6 6 0 0 1-6-6V14.5H5a1.5 1.5 0 0 1-1.5-1.5v-1A1.5 1.5 0 0 1 5 10.5h1V10a6.002 6.002 0 0 1 5-5.93V3a1 1 0 0 1 1-1Zm-3 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm-4.5 4.75a.75.75 0 0 0 0 1.5h3a.75.75 0 0 0 0-1.5h-3Z"
                />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
                aria-hidden="true"
              >
                <path d="M12 2v2.5" />
                <circle cx="12" cy="13" r="6.5" />
                <path d="M5.5 11.5H4a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h1.5" />
                <path d="M18.5 11.5H20a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1h-1.5" />
                <circle cx="9.5" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
                <circle cx="14.5" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
                <path d="M10.5 15.5h3" />
              </svg>
            )}
          </button>

          {/* Draggable Trash Tool (Drag this icon onto any file to delete it!) */}
          {activeView === "files" && files.length > 0 && (
            <div
              onPointerDown={handleTrashPointerDown}
              className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-150 cursor-grab active:cursor-grabbing select-none ${
                trashDragPos
                  ? "bg-white/10 text-white/30 scale-90 opacity-30"
                  : "text-white/40 hover:text-white hover:bg-white/10 hover:scale-110"
              }`}
              aria-label="Trash: Drag onto file to delete"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
          )}
        </div>

        {/* Right: Minimal White Battery Outline & Percentage + Subtle Pin Button */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {battery.has_battery ? (
            <div className="flex items-center gap-1.5 text-white/90">
              <div className="relative w-[18px] h-[10px] rounded-[2px] border border-white/60 p-[1px] flex items-center">
                <div
                  className="h-full rounded-[1px] bg-white transition-all duration-300"
                  style={{
                    width: `${Math.max(10, Math.min(100, battery.percentage))}%`,
                  }}
                />
                <div className="absolute -right-[2.5px] w-[1.5px] h-[4px] bg-white/60 rounded-r-[0.5px]" />
              </div>
              <span className="font-mono text-[11px] font-medium text-white/90 leading-none">
                {battery.percentage}%
                {battery.is_charging && (
                  <span className="ml-0.5 text-[9.5px] text-white/80">⚡</span>
                )}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-[#71717A]">
              <span>AC</span>
            </div>
          )}

          <button
            type="button"
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors cursor-pointer ${
              isPinned
                ? "text-white bg-white/10 hover:bg-white/15"
                : "text-[#71717A] hover:text-[#A1A1AA] hover:bg-white/5"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={isPinned ? "Unpin Dynamic Island" : "Pin Dynamic Island open"}
            aria-pressed={isPinned}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={isPinned ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="17" x2="12" y2="22" />
              <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a1 1 0 0 0 0-2H8a1 1 0 0 0 0 2h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
            </svg>
          </button>
        </div>
      </div>

      {/* =========================================================================
          2. Main Body: Full width on Home Menu, or 3-column layout on Feature Views
          ========================================================================= */}
      {activeView === "menu" ? (
        <div className="w-full flex-1 flex flex-col justify-end mt-2 min-h-0">
          <HomeMenu
            currentView={activeView}
            onSelectView={onSelectView}
            media={media}
            battery={battery}
            filesCount={files.length}
            call={call}
            stats={stats}
          />
        </div>
      ) : activeView === "companion" ? (
        <div className="flex items-center justify-center w-full flex-1 min-h-0 mt-1">
          <CompanionView
            media={media}
            battery={battery}
            stats={stats}
            call={call}
          />
        </div>
      ) : (
        <div className="flex items-center w-full flex-1 min-h-0 mt-2 gap-3.5">
          {/* Side Chevron Left (Wrapped in gray circle, completely spaced from content) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handlePrevView();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-7 h-7 rounded-full bg-[#1e1e24] hover:bg-[#2c2c34] active:bg-[#16161a] active:scale-90 hover:scale-105 border border-white/[0.14] hover:border-white/30 text-white/75 hover:text-white flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-150 flex-shrink-0 cursor-pointer"
            aria-label="Previous menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-0.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="flex-1 min-w-0 h-full flex flex-col justify-end">
            {activeView === "music" && (
              <MusicView
                media={media}
                onTogglePlayPause={onTogglePlayPause}
                onNext={onNext}
                onPrevious={onPrevious}
                onSeek={onSeek}
              />
            )}

            {activeView === "files" && (
              <FileDockView
                files={files}
                onAddFiles={onAddFiles}
                onRemoveFile={onRemoveFile}
                onClearFiles={onClearFiles}
                onCopyPath={onCopyPath}
                hoveredDeleteFileId={hoveredDeleteFileId}
              />
            )}

            {activeView === "calls" && (
              <CallsView
                call={call}
                onAnswer={onAnswerCall}
                onDecline={onDeclineCall}
                onEndCall={onEndCall}
                onToggleMute={onToggleMute}
              />
            )}

            {activeView === "system" && (
              <SystemView
                battery={battery}
                stats={stats}
                onSetVolume={onSetVolume}
                onToggleMute={onToggleSystemMute}
              />
            )}
          </div>

          {/* Side Chevron Right (Wrapped in gray circle, completely spaced from content) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNextView();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-7 h-7 rounded-full bg-[#1e1e24] hover:bg-[#2c2c34] active:bg-[#16161a] active:scale-90 hover:scale-105 border border-white/[0.14] hover:border-white/30 text-white/75 hover:text-white flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-150 flex-shrink-0 cursor-pointer"
            aria-label="Next menu"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="ml-0.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {/* Floating Dragged Trash Icon (Directly centered under cursor anywhere across the island) */}
      {trashDragPos && (
        <div
          className="absolute z-50 pointer-events-none w-10 h-10 rounded-full bg-[#1e1e24]/95 text-white flex items-center justify-center border border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.7)] backdrop-blur-md"
          style={{
            left: `${trashDragPos.x}px`,
            top: `${trashDragPos.y}px`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>
      )}
    </div>
  );
};
