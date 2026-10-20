import { useState, useEffect, useCallback } from "react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import type { DockedFile } from "../types.ts";

const STORAGE_KEY = "dynamic_island_file_dock";

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toUpperCase() : "FILE";
}

export function cleanFilePath(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  if (s.startsWith("file://")) {
    try {
      s = decodeURIComponent(new URL(s).pathname);
    } catch {
      s = decodeURIComponent(s.replace(/^file:\/\//, ""));
    }
  } else {
    try {
      s = decodeURIComponent(s);
    } catch {
      // keep s as is
    }
  }
  return s.replace(/[/\\]+$/, "");
}

export function cleanFileName(raw: string): string {
  if (!raw) return "Untitled";
  const cleaned = cleanFilePath(raw);
  const parts = cleaned.split(/[/\\]/);
  const last = parts.pop() || cleaned;
  return last.trim() || "Untitled";
}

export function isImageExtension(ext: string): boolean {
  return ["PNG", "JPG", "JPEG", "WEBP", "GIF", "SVG", "BMP", "ICO"].includes(ext.toUpperCase());
}

function loadInitialFiles(): DockedFile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => ({
          ...item,
          name: cleanFileName(item.name || item.path),
          path: cleanFilePath(item.path),
        }));
      }
    }
  } catch (err) {
    console.warn("Failed to load file dock from localStorage:", err);
  }
  return [];
}

export function useFileDock() {
  const [files, setFiles] = useState<DockedFile[]>(loadInitialFiles);

  // Save to localStorage whenever files change (strip temporary blob: URLs so storage doesn't corrupt)
  useEffect(() => {
    try {
      const storable = files.map((f) =>
        f.thumbnailUrl && f.thumbnailUrl.startsWith("blob:")
          ? { ...f, thumbnailUrl: undefined }
          : f
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(storable));
    } catch (err) {
      console.warn("Failed to persist file dock:", err);
    }
  }, [files]);

  // Check validity of file paths using Rust backend & load thumbnails if missing
  const checkValidity = useCallback(async () => {
    if (!isTauri() || files.length === 0) return;

    try {
      const updated = await Promise.all(
        files.map(async (f) => {
          if (!f.path) return f;
          try {
            const exists = await invoke<boolean>("check_file_exists", { path: f.path });
            let thumb = f.thumbnailUrl;
            if (exists && !thumb && isImageExtension(f.extension)) {
              thumb = (await invoke<string | null>("get_file_thumbnail", { path: f.path })) || undefined;
            }
            return { ...f, exists, thumbnailUrl: thumb };
          } catch {
            return f;
          }
        })
      );
      setFiles(updated);
    } catch (err) {
      console.warn("Failed to check file dock validity:", err);
    }
  }, [files]);

  useEffect(() => {
    checkValidity();
  }, []);

  const addFiles = useCallback((incomingFiles: FileList | File[] | string[]) => {
    const newItems: DockedFile[] = [];

    if (Array.isArray(incomingFiles) && typeof incomingFiles[0] === "string") {
      // Array of paths from Tauri drag-drop or URI drop
      for (const rawPath of incomingFiles as string[]) {
        const path = cleanFilePath(rawPath);
        const name = cleanFileName(rawPath);
        const ext = getExtension(name);
        newItems.push({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name,
          path,
          extension: ext,
          addedAt: Date.now(),
          exists: true,
        });
      }
    } else {
      // FileList or File[] from HTML5 drag-and-drop / file picker
      const list = Array.from(incomingFiles as (FileList | File[]));
      for (const f of list) {
        const fileObj = f as File & { path?: string };
        const rawPath = fileObj.path || fileObj.name;
        const path = cleanFilePath(rawPath);
        const name = cleanFileName(fileObj.name || rawPath);
        const ext = getExtension(name);
        let thumb: string | undefined = undefined;
        if (fileObj.type?.startsWith("image/") || isImageExtension(ext)) {
          try {
            thumb = URL.createObjectURL(fileObj);
          } catch {
            // ignore
          }
        }
        newItems.push({
          id: `file_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          name,
          path,
          extension: ext,
          size: fileObj.size,
          addedAt: Date.now(),
          exists: true,
          thumbnailUrl: thumb,
        });
      }
    }

    if (newItems.length > 0) {
      setFiles((prev) => {
        // Prevent duplicate paths
        const existingPaths = new Set(prev.map((p) => p.path));
        const filteredNew = newItems.filter((item) => !existingPaths.has(item.path));
        return [...filteredNew, ...prev];
      });

      // Fetch thumbnails for native image paths asynchronously
      if (isTauri()) {
        for (const item of newItems) {
          if (!item.thumbnailUrl && isImageExtension(item.extension) && item.path) {
            invoke<string | null>("get_file_thumbnail", { path: item.path })
              .then((thumb) => {
                if (thumb) {
                  setFiles((prev) =>
                    prev.map((f) => (f.id === item.id ? { ...f, thumbnailUrl: thumb } : f))
                  );
                }
              })
              .catch((err) => {
                console.warn("Failed to get thumbnail for file:", item.path, err);
              });
          }
        }
      }
    }
  }, []);

  // Removes item from the collection ONLY. Never deletes from disk!
  const removeFile = useCallback((idOrPath: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== idOrPath && f.path !== idOrPath));
  }, []);

  // Clears all file references from collection
  const clearFiles = useCallback(() => {
    setFiles([]);
  }, []);

  // Copy path to clipboard
  const copyFilePath = useCallback(async (path: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(path);
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    files,
    addFiles,
    removeFile,
    clearFiles,
    checkValidity,
    copyFilePath,
  };
}

