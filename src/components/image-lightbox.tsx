"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface ImageLightboxProps {
  paths: string[];
  currentIndex: number;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export function ImageLightbox({
  paths,
  currentIndex,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const total = paths.length;
  const currentPath = paths[currentIndex];

  const handlePrev = useCallback(() => {
    onNavigate((currentIndex - 1 + total) % total);
  }, [currentIndex, total, onNavigate]);

  const handleNext = useCallback(() => {
    onNavigate((currentIndex + 1) % total);
  }, [currentIndex, total, onNavigate]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, handlePrev, handleNext]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (!currentPath) return null;

  const src =
    currentPath.startsWith("http://") ||
    currentPath.startsWith("https://") ||
    currentPath.startsWith("data:")
      ? currentPath
      : `/api/violations/screenshot/${encodeURI(currentPath)}`;

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/80"
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="关闭图片预览"
        className="absolute top-4 right-4 z-10 flex size-9 items-center justify-center rounded-lg bg-stone-800/60 text-white transition-colors hover:bg-stone-700"
      >
        <X className="size-5" />
      </button>

      {/* Prev */}
      {total > 1 && (
        <button
          type="button"
          onClick={handlePrev}
          aria-label="上一张"
          className="absolute left-4 z-10 flex size-9 items-center justify-center rounded-lg bg-stone-800/60 text-white transition-colors hover:bg-stone-700"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}

      {/* Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`截图 ${currentIndex + 1}/${total}`}
        className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain"
      />

      {/* Next */}
      {total > 1 && (
        <button
          type="button"
          onClick={handleNext}
          aria-label="下一张"
          className="absolute right-4 z-10 flex size-9 items-center justify-center rounded-lg bg-stone-800/60 text-white transition-colors hover:bg-stone-700"
        >
          <ChevronRight className="size-5" />
        </button>
      )}

      {/* Counter */}
      {total > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-lg bg-stone-800/60 px-3 py-1.5 text-[12px] tabular-nums text-white">
          {currentIndex + 1} / {total}
        </div>
      )}
    </div>
  );
}
