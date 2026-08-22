"use client";

import React, { useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Side the drawer slides in from. */
  side?: "left" | "right";
  children: React.ReactNode;
}

/**
 * A dark slide-over panel. Holds the detail views (agent roster, live activity,
 * controls) so the main feed stays clean — the spectator opens one only when
 * they want to see what's under the hood.
 */
export const Drawer: React.FC<DrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  side = "right",
  children,
}) => {
  // Close on Escape, and lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const edge = side === "right" ? "right-0" : "left-0";
  const hidden = side === "right" ? "translate-x-full" : "-translate-x-full";
  const round = side === "right" ? "rounded-l-2xl" : "rounded-r-2xl";

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`}
      aria-hidden={!open}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute ${edge} top-0 h-full w-full max-w-[400px] ${round} border-x-border bg-x-bg shadow-2xl transition-transform duration-300 ease-out-expo ${
          side === "right" ? "border-l" : "border-r"
        } ${open ? "translate-x-0" : hidden} flex flex-col`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-x-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[17px] font-bold tracking-tight text-x-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-x-secondary">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-full p-1.5 text-x-secondary transition-colors hover:bg-x-hover hover:text-x-primary"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
};
