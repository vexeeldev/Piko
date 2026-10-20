import React from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface DragHandleProps {
  className?: string;
}

export const DragHandle: React.FC<DragHandleProps> = ({ className = "" }) => {
  const handlePointerDown = async (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    if (isTauri()) {
      try {
        const appWindow = getCurrentWindow();
        await appWindow.startDragging();
      } catch (err) {
        console.warn("Failed to initiate window dragging:", err);
      }
    }
  };

  return (
    <div
      className={`group w-full h-3 flex items-center justify-center cursor-grab active:cursor-grabbing select-none opacity-60 hover:opacity-100 transition-opacity touch-none ${className}`}
      data-tauri-drag-region
      onPointerDown={handlePointerDown}
      onClick={(e) => e.stopPropagation()}
      title="Drag to reposition Dynamic Island"
    >
      <div className="w-8 h-[3px] bg-[#71717A] rounded-full transition-all duration-200 group-hover:w-10 group-hover:bg-[#A1A1AA]" />
    </div>
  );
};
