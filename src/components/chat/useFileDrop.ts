import { useRef, useState, type DragEvent } from "react";

export interface FileDropHandlers {
  onDragEnter: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}

/**
 * Drag-and-drop file target. Uses an enter/leave counter so hovering child
 * elements doesn't flicker the overlay. `onDragOver` must preventDefault for
 * the drop event to fire.
 */
export function useFileDrop(onFiles: (files: File[]) => void): {
  isDragging: boolean;
  handlers: FileDropHandlers;
} {
  const [isDragging, setDragging] = useState(false);
  const depth = useRef(0);

  return {
    isDragging,
    handlers: {
      onDragEnter: (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        depth.current += 1;
        setDragging(true);
      },
      onDragOver: (e) => {
        if (!e.dataTransfer?.types?.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      },
      onDragLeave: (e) => {
        e.preventDefault();
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      },
      onDrop: (e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const files = Array.from(e.dataTransfer?.files ?? []);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}
