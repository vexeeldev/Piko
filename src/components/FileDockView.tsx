import React, { useState, useRef, useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { DockedFile } from "../types";

interface FileDockViewProps {
  files: DockedFile[];
  onAddFiles: (files: FileList | File[] | string[]) => void;
  onRemoveFile: (id: string) => void;
  onClearFiles: () => void;
  onCopyPath: (path: string) => Promise<boolean>;
  hoveredDeleteFileId?: string | null;
}

function formatFileSize(bytes?: number): string {
  if (bytes == null || isNaN(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getBadgeColor(ext: string): string {
  const e = ext.toUpperCase();
  if (["PNG", "JPG", "JPEG", "GIF", "WEBP", "SVG"].includes(e)) {
    return "bg-purple-500/20 text-purple-300";
  }
  if (["MP3", "WAV", "FLAC", "OGG", "M4A"].includes(e)) {
    return "bg-emerald-500/20 text-emerald-300";
  }
  if (["PDF", "DOC", "DOCX", "TXT", "MD"].includes(e)) {
    return "bg-blue-500/20 text-blue-300";
  }
  if (["ZIP", "TAR", "GZ", "7Z"].includes(e)) {
    return "bg-amber-500/20 text-amber-300";
  }
  if (["TS", "JS", "RS", "PY", "JSON", "HTML", "CSS"].includes(e)) {
    return "bg-cyan-500/20 text-cyan-300";
  }
  return "bg-white/10 text-white/80";
}

export const FileDockView: React.FC<FileDockViewProps> = ({
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles: _onClearFiles,
  onCopyPath,
  hoveredDeleteFileId,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Listen to native Tauri OS drag-drop events (from Nautilus / GNOME desktop)
  useEffect(() => {
    if (!isTauri()) return;

    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWebview } = await import("@tauri-apps/api/webview");
        unlisten = await getCurrentWebview().onDragDropEvent((event) => {
          if (event.payload.type === "enter" || event.payload.type === "over") {
            setIsDragOver(true);
          } else if (event.payload.type === "drop") {
            setIsDragOver(false);
            if ((window as any).__isOverTrash) {
              const winFile = (window as any).__draggingDockedFile;
              const target = winFile?.id || winFile?.path || event.payload.paths?.[0];
              if (target) {
                onRemoveFile(target);
              }
              (window as any).__isOverTrash = false;
              (window as any).__lastInternalDragTime = Date.now();
              return;
            }
            if (Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500) {
              return;
            }
            if (event.payload.paths && event.payload.paths.length > 0) {
              onAddFiles(event.payload.paths);
            }
          } else if (event.payload.type === "leave") {
            setIsDragOver(false);
          }
        });
      } catch (err) {
        console.warn("Failed to listen to Tauri drag drop in FileDockView:", err);
      }
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [onAddFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (Date.now() - ((window as any).__lastInternalDragTime || 0) < 1500) {
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
      return;
    }

    // Fallback for Linux URI list (Nautilus, Dolphin, etc.)
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
        onAddFiles(paths);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(e.target.files);
    }
  };

  const handleItemDoubleClick = async (e: React.MouseEvent, file: DockedFile) => {
    e.stopPropagation();
    const ok = await onCopyPath(file.path);
    if (ok) {
      setCopiedId(file.id);
      setTimeout(() => setCopiedId(null), 1200);
    }
  };

  const handleItemDragStart = (e: React.DragEvent, file: DockedFile) => {
    e.stopPropagation();
    (window as any).__draggingDockedFile = file;
    (window as any).__lastInternalDragTime = Date.now();
    (window as any).__isOverTrash = false;
    e.dataTransfer.setData("application/x-docked-file-id", file.id);
    e.dataTransfer.setData("text/plain", file.path);
    e.dataTransfer.setData("text/uri-list", `file://${file.path}`);
    e.dataTransfer.effectAllowed = "copyMove";
  };

  const handleItemDragEnd = (_e: React.DragEvent, file: DockedFile) => {
    (window as any).__lastInternalDragTime = Date.now();
    if ((window as any).__isOverTrash) {
      onRemoveFile(file.id);
      (window as any).__isOverTrash = false;
    }
    setTimeout(() => {
      (window as any).__draggingDockedFile = null;
    }, 1000);
  };

  return (
    <div
      className="relative flex items-center w-full h-[128px] select-none text-[#F5F5F5]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Content: Seamless Empty Dropzone OR Floating Icons (No Gray Card Box) */}
      {files.length === 0 || (isDragOver && files.length === 0) ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center w-full h-full rounded-[20px] transition-all cursor-pointer ${
            isDragOver
              ? "border-2 border-dashed border-blue-500 bg-blue-500/10 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.25)]"
              : "border border-dashed border-white/15 hover:border-white/30 bg-white/[0.02] hover:bg-white/[0.05]"
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mb-2">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-all ${isDragOver ? "text-blue-400 scale-110" : "text-white/50"}`}
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <span className={`text-[12.5px] font-medium tracking-tight transition-colors ${isDragOver ? "text-blue-400" : "text-white/80"}`}>
            {isDragOver ? "Release to drop files" : "Drop files here"}
          </span>
          <span className={`text-[10px] mt-1 transition-colors ${isDragOver ? "text-blue-300/80" : "text-white/35"}`}>
            Click to browse or drag from Nautilus
          </span>
        </div>
      ) : (
        /* Pure Floating Shelf: No gray card background, true 1:1 square icon aspect ratio */
        <div
          className={`flex items-center gap-3.5 w-full h-full overflow-x-auto overflow-y-hidden py-1 px-1 transition-all scrollbar-none ${
            isDragOver ? "bg-blue-500/10 rounded-[16px]" : ""
          }`}
          data-no-drag="true"
        >
          {files.map((file) => (
            <div
              key={file.id}
              data-file-id={file.id}
              draggable="true"
              onDragStart={(e) => handleItemDragStart(e, file)}
              onDragEnd={(e) => handleItemDragEnd(e, file)}
              onDoubleClick={(e) => handleItemDoubleClick(e, file)}
              className={`relative w-[76px] flex flex-col items-center flex-shrink-0 cursor-grab active:cursor-grabbing group select-none py-1 transition-all duration-150 ${
                hoveredDeleteFileId === file.id
                  ? "scale-90 opacity-25"
                  : "hover:scale-[1.03]"
              }`}
            >
              {/* Perfect 1:1 Square Thumbnail (56px × 56px) - Never Stretched / Gepeng */}
              <div className="relative w-[56px] h-[56px] rounded-[13px] overflow-hidden flex items-center justify-center flex-shrink-0 shadow-[0_4px_14px_rgba(0,0,0,0.5)]">
                {file.thumbnailUrl ? (
                  <img
                    src={file.thumbnailUrl}
                    alt={file.name}
                    className="w-full h-full object-cover rounded-[13px]"
                    loading="lazy"
                  />
                ) : (
                  <div className={`w-full h-full flex flex-col items-center justify-center gap-1 rounded-[13px] ${getBadgeColor(file.extension)}`}>
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="opacity-80"
                    >
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[8px] font-mono font-bold tracking-wider uppercase leading-none">
                      {file.extension.slice(0, 4)}
                    </span>
                  </div>
                )}
              </div>

              {/* File Meta: Clean Name and Extension/Size with comfortable spacing */}
              <div className="w-full flex flex-col items-center mt-2 px-0.5 min-w-0">
                <span
                  className="w-full text-[10.5px] font-medium text-white/90 truncate text-center leading-snug"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="text-[8.5px] font-mono text-white/40 truncate text-center leading-none mt-1">
                  {formatFileSize(file.size) || file.extension.toUpperCase()}
                </span>
              </div>

              {/* Double-Click "Copied!" Feedback Badge */}
              {copiedId === file.id && (
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 backdrop-blur-sm rounded-[13px] animate-in fade-in zoom-in-95 duration-100">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-[9px] font-semibold text-emerald-400 mt-1">Copied!</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
