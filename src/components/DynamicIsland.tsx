import React, { useState, useRef, useEffect, useCallback } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { CompactView } from "./CompactView";
import { ExpandedView } from "./ExpandedView";
import { IncomingCallView } from "./IncomingCallView";
import { ActiveCallView } from "./ActiveCallView";
import { OutgoingCallView } from "./OutgoingCallView";
import { useSystemData } from "../hooks/useSystemData";
import { useCallData } from "../hooks/useCallData";
import { useFileDock } from "../hooks/useFileDock";
import { ActiveView } from "../types";

interface DynamicIslandProps {
  isExpanded: boolean;
  onToggle: (nextState: boolean) => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({
  isExpanded,
  onToggle,
}) => {
  const [isPinned, setIsPinned] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  // Active feature view navigation
  const [activeView, setActiveView] = useState<ActiveView>("music");
  const [lastFeatureView, setLastFeatureView] = useState<ActiveView>("music");

  // Temporary File Dock hook
  const {
    files,
    addFiles,
    removeFile,
    clearFiles,
    copyFilePath,
  } = useFileDock();

  const handleToggleMenu = useCallback(() => {
    setActiveView((prev) => (prev === "menu" ? lastFeatureView : "menu"));
  }, [lastFeatureView]);

  const handleSelectView = useCallback((view: ActiveView) => {
    setActiveView(view);
    if (view !== "menu") {
      setLastFeatureView(view);
    }
  }, []);

  // System media & battery data
  const {
    battery,
    media,
    stats,
    setVolume,
    toggleMute: toggleSystemMute,
    togglePlayPause,
    nextTrack,
    previousTrack,
    seekTrack,
  } = useSystemData(isExpanded);

  // Call management state
  const {
    call,
    answerCall,
    declineCall,
    endCall,
    toggleMute,
    triggerMockIncomingCall,
    triggerMockOutgoingCall,
    triggerMockCallEnded,
  } = useCallData();

  const hasActiveCall = Boolean(
    call && call.state !== "idle" && call.state !== "ended"
  );

  // Island automatically expands if a call is incoming, outgoing, or active
  const isPanelExpanded = isExpanded || hasActiveCall;

  const isInputShapeInitialized = useRef(false);

  // Sync native window input shape so transparent area is click-through while hover expansion is seamless
  useEffect(() => {
    if (!isTauri()) return;
    if (isPanelExpanded) {
      // Expanded state: Full 500x210 window interactive so all panels and edge buttons work cleanly
      invoke("set_island_input_shape", {
        x: 0,
        y: 0,
        width: 500,
        height: 210,
        radius: 0,
      }).catch((err) => {
        console.warn("Failed to set island expanded input shape:", err);
      });
    } else {
      const applyCompact = () => {
        // Compact capsule: spans x: 97..347, height: 7..63 in 500px window
        // Hitbox x: 80, width: 285 covers x: 80..365 with comfortable 18px buffer on both sides
        // Outside (0..80, 365..500) and below (72..210) are 100% click-through!
        invoke("set_island_input_shape", {
          x: 80,
          y: 0,
          width: 285,
          height: 72,
          radius: 24,
        }).catch((err) => {
          console.warn("Failed to set island compact input shape:", err);
        });
      };

      if (!isInputShapeInitialized.current) {
        isInputShapeInitialized.current = true;
        applyCompact();
      } else {
        // When collapsing, wait until CSS transition (380ms) completes before shrinking input region
        const timer = setTimeout(applyCompact, 400);
        return () => clearTimeout(timer);
      }
    }
  }, [isPanelExpanded]);

  // Log when DynamicIsland transitions to a call view
  useEffect(() => {
    if (hasActiveCall && call) {
      console.log("[DI-Frontend] DynamicIsland switched to call view:", {
        id: call.id,
        state: call.state,
        direction: call.direction,
        contactName: call.contactName || "Unknown Caller",
      });
    }
  }, [hasActiveCall, call]);

  // Expose mock testing triggers to window for testing
  useEffect(() => {
    (window as unknown as {
      __dynamicIslandMock?: {
        incoming: (opts?: Record<string, unknown>) => void;
        outgoing: (opts?: Record<string, unknown>) => void;
        end: () => void;
      };
    }).__dynamicIslandMock = {
      incoming: triggerMockIncomingCall,
      outgoing: triggerMockOutgoingCall,
      end: triggerMockCallEnded,
    };
  }, [triggerMockIncomingCall, triggerMockOutgoingCall, triggerMockCallEnded]);

  // Hover debounce & drag refs
  const debounceTimeoutRef = useRef<number | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const isDragCandidateRef = useRef<boolean>(false);
  const isDraggingRef = useRef<boolean>(false);
  const isExternalFileDraggingRef = useRef<boolean>(false);
  const isDragHoverActiveRef = useRef<boolean>(false);
  const savedViewBeforeDragRef = useRef<ActiveView | null>(null);
  const savedExpandedBeforeDragRef = useRef<boolean>(false);
  const dragLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragCooldownRef = useRef<boolean>(false);
  const DRAG_THRESHOLD = 6;

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimeoutRef.current !== null) {
      window.clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
  }, []);

  const handleCollapse = useCallback(() => {
    clearDebounceTimer();
    // Do not collapse if call is active
    if (hasActiveCall) return;
    setIsPinned(false);
    onToggle(false);
  }, [clearDebounceTimer, onToggle, hasActiveCall]);

  const triggerFileDockExpansion = useCallback(() => {
    if (hasActiveCall) return;
    isExternalFileDraggingRef.current = true;
    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
    clearDebounceTimer();

    // If starting a new drag-hover session, save the current state!
    if (!isDragHoverActiveRef.current) {
      isDragHoverActiveRef.current = true;
      savedViewBeforeDragRef.current = activeView;
      savedExpandedBeforeDragRef.current = isExpanded;
    }

    if (!isExpanded) {
      onToggle(true);
    }
    setActiveView("files");
  }, [hasActiveCall, onToggle, clearDebounceTimer, activeView, isExpanded]);

  const revertDragHover = useCallback(() => {
    if (!isDragHoverActiveRef.current) return;
    isDragHoverActiveRef.current = false;
    isExternalFileDraggingRef.current = false;

    const prevView = savedViewBeforeDragRef.current;
    const wasExpanded = savedExpandedBeforeDragRef.current;
    savedViewBeforeDragRef.current = null;

    if (prevView) {
      setActiveView(prevView);
      if (prevView !== "menu") {
        setLastFeatureView(prevView);
      }
    }
    if (!wasExpanded) {
      onToggle(false);
    }
  }, [onToggle]);

  // Keyboard shortcut: Esc collapses & unpins (unless in a call)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPanelExpanded && !hasActiveCall) {
        handleCollapse();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelExpanded, hasActiveCall, handleCollapse]);

  // Clean up debounce on unmount
  useEffect(() => {
    return () => {
      clearDebounceTimer();
    };
  }, [clearDebounceTimer]);

  // Pointer Enter: Expand immediately & cancel pending collapse
  const handlePointerEnter = () => {
    clearDebounceTimer();

    // If actively dragging, do not trigger hover expansion
    if (isDraggingRef.current) return;

    if (!isPanelExpanded) {
      onToggle(true);
    }
  };

  // Pointer Leave: Smooth, responsive collapse (120ms debounce)
  const handlePointerLeave = () => {
    clearDebounceTimer();

    // If a call is active, pinned, window-dragging, or external file dragging: DO NOT collapse!
    if (hasActiveCall || isPinned || isDraggingRef.current || isExternalFileDraggingRef.current) return;

    debounceTimeoutRef.current = window.setTimeout(() => {
      onToggle(false);
      debounceTimeoutRef.current = null;
    }, 120);
  };

  // End drag helper: cleanly resets drag candidate and dragging flag
  const endDrag = useCallback(() => {
    isDragCandidateRef.current = false;
    pointerDownPos.current = null;
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      setIsDragging(false);
      dragCooldownRef.current = true;
      setTimeout(() => {
        dragCooldownRef.current = false;
      }, 150);
    }
  }, []);

  // Global window listeners to ensure drag state cleanup even if pointerup is dropped
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      endDrag();
    };
    const handleGlobalBlur = () => {
      endDrag();
    };

    window.addEventListener("pointerup", handleGlobalPointerUp);
    window.addEventListener("pointercancel", handleGlobalPointerUp);
    window.addEventListener("blur", handleGlobalBlur);
    return () => {
      window.removeEventListener("pointerup", handleGlobalPointerUp);
      window.removeEventListener("pointercancel", handleGlobalPointerUp);
      window.removeEventListener("blur", handleGlobalBlur);
    };
  }, [endDrag]);

  // Pointer Down: Track initial drag position (ignore clicks on interactive controls)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    // Do not initiate drag if clicking on a button, role=button, or seek bar / slider
    const target = e.target as HTMLElement | null;
    if (target && target.closest("button, [role='button'], [role='slider'], input, [data-no-drag='true']")) {
      return;
    }

    pointerDownPos.current = { x: e.screenX, y: e.screenY };
    isDragCandidateRef.current = true;
  };

  // Pointer Move: Start window dragging if distance exceeds threshold
  const handlePointerMove = async (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragCandidateRef.current || !pointerDownPos.current || e.buttons !== 1) return;

    const deltaX = Math.abs(e.screenX - pointerDownPos.current.x);
    const deltaY = Math.abs(e.screenY - pointerDownPos.current.y);
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > DRAG_THRESHOLD && !isDraggingRef.current) {
      isDragCandidateRef.current = false;
      pointerDownPos.current = null;
      isDraggingRef.current = true;
      setIsDragging(true);

      if (isTauri()) {
        try {
          const appWindow = getCurrentWindow();
          await appWindow.startDragging();
        } catch (err) {
          console.warn("Desktop window startDragging failed:", err);
        } finally {
          endDrag();
        }
      }
    }
  };

  // Pointer Up: End drag
  const handlePointerUp = () => {
    endDrag();
  };

  // Capsule click: In compact mode, click expands (DOES NOT PIN!)
  const handleCapsuleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // If a drag just ended, swallow the click so controls aren't accidentally triggered
    if (dragCooldownRef.current || isDraggingRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // In compact mode, clicking expands without pinning
    if (!isPanelExpanded) {
      clearDebounceTimer();
      onToggle(true);
    }
  };

  // Pin button click: ONLY WAY to toggle pin state
  const handleTogglePin = () => {
    setIsPinned((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!isPanelExpanded && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      clearDebounceTimer();
      onToggle(true);
    }
  };

  // Listen to native Tauri OS drag-drop events (from Nautilus / GNOME desktop)
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          const isInternal = Boolean(
            (window as any).__draggingDockedFile ||
            Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500
          );
          if (isInternal) return;

          // 1. Drag approaching or hovering over the island: auto-expand and switch straight to File Dock!
          if (event.payload.type === "enter" || event.payload.type === "over") {
            triggerFileDockExpansion();
            return;
          }

          // 2. Drop files
          if (event.payload.type === "drop") {
            if (dragLeaveTimerRef.current) {
              clearTimeout(dragLeaveTimerRef.current);
              dragLeaveTimerRef.current = null;
            }
            isDragHoverActiveRef.current = false;
            isExternalFileDraggingRef.current = false;
            savedViewBeforeDragRef.current = null;

            if ((window as any).__isOverTrash) {
              const winFile = (window as any).__draggingDockedFile;
              const target = winFile?.id || winFile?.path || event.payload.paths?.[0];
              if (target) {
                removeFile(target);
              }
              (window as any).__isOverTrash = false;
              (window as any).__lastInternalDragTime = Date.now();
              return;
            }

            if (event.payload.paths && event.payload.paths.length > 0) {
              addFiles(event.payload.paths);
              if (!isExpanded) {
                onToggle(true);
              }
              setActiveView("files");
              setLastFeatureView("files");
            }
          } else if (event.payload.type === "leave") {
            if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
            dragLeaveTimerRef.current = setTimeout(() => {
              revertDragHover();
            }, 350);
          }
        });
      } catch (err) {
        console.warn("Failed to attach Tauri drag drop listener in DynamicIsland:", err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [addFiles, isExpanded, onToggle, removeFile, revertDragHover, triggerFileDockExpansion]);

  // Window-level capture listeners for HTML5 dragenter / dragover from Nautilus, desktop or browser
  useEffect(() => {
    const handleDragEnterOver = (e: DragEvent) => {
      const isInternal = Boolean(
        (window as any).__draggingDockedFile ||
        Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500
      );
      if (isInternal) return;

      // Crucial: calling preventDefault() tells the OS/browser this window accepts the drag!
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }

      triggerFileDockExpansion();
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = setTimeout(() => {
          revertDragHover();
        }, 350);
      }
    };

    const handleWindowDrop = (e: DragEvent) => {
      e.preventDefault();
      if (dragLeaveTimerRef.current) {
        clearTimeout(dragLeaveTimerRef.current);
        dragLeaveTimerRef.current = null;
      }
      isDragHoverActiveRef.current = false;
      isExternalFileDraggingRef.current = false;
      savedViewBeforeDragRef.current = null;

      const isInternal = Boolean(
        (window as any).__draggingDockedFile ||
        Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500
      );
      if (isInternal) return;

      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
        if (!isExpanded) {
          onToggle(true);
        }
        setActiveView("files");
        setLastFeatureView("files");
        return;
      }

      const uriList = e.dataTransfer?.getData("text/uri-list") || e.dataTransfer?.getData("text/plain");
      if (uriList) {
        const paths = uriList
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0 && !l.startsWith("#"))
          .map((uri) => {
            if (uri.startsWith("file://")) {
              try {
                return decodeURIComponent(new URL(uri).pathname);
              } catch {
                return decodeURIComponent(uri.replace(/^file:\/\//, ""));
              }
            }
            return uri;
          });
        if (paths.length > 0) {
          addFiles(paths);
          if (!isExpanded) {
            onToggle(true);
          }
          setActiveView("files");
          setLastFeatureView("files");
        }
      }
    };

    // Use capture phase (true) so we intercept events before any child or pointer-events:none can block it
    window.addEventListener("dragenter", handleDragEnterOver, true);
    window.addEventListener("dragover", handleDragEnterOver, true);
    window.addEventListener("dragleave", handleDragLeave, true);
    window.addEventListener("drop", handleWindowDrop, true);

    return () => {
      window.removeEventListener("dragenter", handleDragEnterOver, true);
      window.removeEventListener("dragover", handleDragEnterOver, true);
      window.removeEventListener("dragleave", handleDragLeave, true);
      window.removeEventListener("drop", handleWindowDrop, true);
    };
  }, [addFiles, isExpanded, onToggle, revertDragHover, triggerFileDockExpansion]);

  const handleShellDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    const isInternal = Boolean(
      (window as any).__draggingDockedFile ||
      Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500
    );
    if (!isInternal) {
      triggerFileDockExpansion();
    }
  };

  const handleShellDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }
    const isInternal = Boolean(
      (window as any).__draggingDockedFile ||
      Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500
    );
    if (!isInternal) {
      triggerFileDockExpansion();
    }
  };

  const handleShellDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (dragLeaveTimerRef.current) clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = setTimeout(() => {
        revertDragHover();
      }, 350);
    }
  };

  const handleShellDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
    isDragHoverActiveRef.current = false;
    isExternalFileDraggingRef.current = false;
    savedViewBeforeDragRef.current = null;

    if ((window as any).__draggingDockedFile || Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500) {
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
      if (!isExpanded) {
        onToggle(true);
      }
      setActiveView("files");
      setLastFeatureView("files");
      return;
    }

    const uriList = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (uriList) {
      const paths = uriList
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
        .map((uri) => {
          if (uri.startsWith("file://")) {
            try {
              return decodeURIComponent(new URL(uri).pathname);
            } catch {
              return decodeURIComponent(uri.replace(/^file:\/\//, ""));
            }
          }
          return uri;
        });
      if (paths.length > 0) {
        addFiles(paths);
        if (!isExpanded) {
          onToggle(true);
        }
        setActiveView("files");
        setLastFeatureView("files");
      }
    }
  };

  return (
    <div
      className={`dynamic-island-shell relative bg-[#080808] border border-white/[0.09] text-[#F5F5F5] overflow-hidden select-none pointer-events-auto ${
        isPanelExpanded
          ? "w-[440px] h-[196px] rounded-[26px] border-white/[0.14] cursor-default"
          : "w-[250px] h-[56px] rounded-[28px] border-white/[0.09] cursor-pointer hover:border-white/[0.24] hover:scale-[1.02] active:scale-[0.98] active:bg-[#050505]"
      } ${isDragging ? "cursor-grabbing opacity-95" : ""}`}
      role={isPanelExpanded ? "region" : "button"}
      tabIndex={isPanelExpanded ? -1 : 0}
      aria-expanded={isPanelExpanded}
      aria-label={
        isPanelExpanded
          ? "Dynamic Island expanded panel"
          : "Dynamic Island compact capsule"
      }
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleCapsuleClick}
      onKeyDown={handleKeyDown}
      onDragEnter={handleShellDragEnter}
      onDragOver={handleShellDragOver}
      onDragLeave={handleShellDragLeave}
      onDrop={handleShellDrop}
      ref={shellRef}
    >
      {/* 1. Persistent Compact View Layer (Fades out when expanded) */}
      <div
        className={`absolute inset-0 w-full h-[56px] transition-all duration-200 ease-out ${
          isPanelExpanded
            ? "opacity-0 scale-95 pointer-events-none"
            : "opacity-100 scale-100 pointer-events-auto"
        }`}
      >
        <CompactView media={media} />
      </div>

      {/* 2. Expanded Multi-Feature View Layer (Active when expanded and no call is taking priority) */}
      <div
        className={`absolute inset-0 w-[440px] h-[196px] transition-all ease-out ${
          isPanelExpanded && !hasActiveCall
            ? "opacity-100 translate-y-0 pointer-events-auto duration-300 delay-100"
            : "opacity-0 translate-y-2 pointer-events-none duration-150 delay-0"
        }`}
      >
        <ExpandedView
          media={media}
          battery={battery}
          isPinned={isPinned}
          onTogglePin={handleTogglePin}
          onTogglePlayPause={togglePlayPause}
          onNext={nextTrack}
          onPrevious={previousTrack}
          onSeek={seekTrack}
          activeView={activeView}
          onSelectView={handleSelectView}
          onToggleMenu={handleToggleMenu}
          files={files}
          onAddFiles={addFiles}
          onRemoveFile={removeFile}
          onClearFiles={clearFiles}
          onCopyPath={copyFilePath}
          call={call}
          onAnswerCall={answerCall}
          onDeclineCall={declineCall}
          onEndCall={endCall}
          onToggleMute={toggleMute}
          stats={stats}
          onSetVolume={setVolume}
          onToggleSystemMute={toggleSystemMute}
        />
      </div>

      {/* 3. Dynamic Call Layer (Highest priority when a call event is active) */}
      {hasActiveCall && call && (
        <div className="absolute inset-0 w-[440px] h-[196px] transition-all ease-out opacity-100 translate-y-0 pointer-events-auto duration-300">
          {call.direction === "incoming" && (call.state === "incoming" || call.state === "answering") ? (
            <IncomingCallView
              call={call}
              onAnswer={answerCall}
              onDecline={declineCall}
              onToggleMute={toggleMute}
            />
          ) : call.direction === "outgoing" && call.state !== "active" ? (
            <OutgoingCallView
              call={call}
              onEndCall={endCall}
            />
          ) : (
            <ActiveCallView
              call={call}
              onEndCall={endCall}
              onToggleMute={toggleMute}
            />
          )}
        </div>
      )}
    </div>
  );
};
