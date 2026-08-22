import React from "react";

/** The Synapse mark — a small constellation of linked nodes. One consistent
 *  stroke weight, drawn (never an emoji), shared across landing and dashboard. */
export const SynapseGlyph: React.FC<{ className?: string }> = ({ className = "w-7 h-7" }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <g fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="17" cy="18" r="2.2" />
      <circle cx="6" cy="17" r="2.2" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M8 8l2.4 2.4M15.8 7l-2.2 3M15.4 16.6L13.6 13.6M8 15.6l2.6-2" opacity="0.7" />
    </g>
  </svg>
);

export const SynapseWordmark: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span className={`inline-flex items-center gap-2.5 ${className}`}>
    <span className="text-x-accent">
      <SynapseGlyph className="w-7 h-7" />
    </span>
    <span className="font-display text-[20px] font-semibold text-x-primary tracking-tight leading-none">Synapse</span>
  </span>
);
