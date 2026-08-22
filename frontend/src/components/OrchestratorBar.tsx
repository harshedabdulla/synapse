"use client";

import React, { useState } from "react";
import { SimulationScenario } from "../lib/types";
import { BoltIcon, PlayIcon, ChevronDownIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

interface OrchestratorBarProps {
  scenarios: SimulationScenario[];
  onInject: (scenarioId: string) => void;
  busyScenario: string | null;
  simClock: boolean;
  onToggleClock: () => void;
  onReset: () => void;
  isResetting: boolean;
}

export const OrchestratorBar: React.FC<OrchestratorBarProps> = ({
  scenarios,
  onInject,
  busyScenario,
  simClock,
  onToggleClock,
  onReset,
  isResetting,
}) => {
  const [open, setOpen] = useState(true);

  return (
    <section
      className="sticky top-0 z-20 border-b border-x-border bg-x-bg/85 backdrop-blur-md"
      aria-label="Simulation orchestrator"
    >
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <BoltIcon className="w-4 h-4 text-x-accent" />
        <h1 className="data-label text-x-primary">Controls</h1>

        <div className="ml-auto flex items-center gap-2">
          {/* Autonomous clock */}
          <button
            onClick={onToggleClock}
            role="switch"
            aria-checked={simClock}
            className={`flex items-center gap-2 rounded-full border px-2.5 py-1 transition-colors ${
              simClock
                ? "border-x-repost/40 bg-x-repost/10 text-x-repost"
                : "border-x-border text-x-secondary hover:bg-x-hover"
            }`}
            title="Toggle autonomous simulation clock"
          >
            <PlayIcon className="w-3.5 h-3.5" />
            <span className="data-label">Clock {simClock ? "On" : "Off"}</span>
            <span
              className={`relative w-7 h-4 rounded-full transition-colors ${
                simClock ? "bg-x-repost" : "bg-x-elevated-2"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white transition-transform duration-200 ease-out-expo ${
                  simClock ? "translate-x-3" : ""
                }`}
              />
            </span>
          </button>

          <button
            onClick={onReset}
            disabled={isResetting}
            className="flex items-center gap-1.5 rounded-full border border-x-like/40 text-x-like hover:bg-x-like/10 px-2.5 py-1 transition-colors disabled:opacity-50"
            title="Flush all posts and telemetry"
          >
            <ArrowPathIcon className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
            <span className="data-label">Reset</span>
          </button>

          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={open ? "Collapse scenarios" : "Expand scenarios"}
            className="text-x-secondary hover:text-x-primary p-1 rounded-full hover:bg-x-hover transition-colors"
          >
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-3">
          <p className="text-[12px] text-x-secondary mb-2">
            Inject a network event to seed a root post from one agent. The discovery pipeline wakes
            the semantically relevant agents on its own.
          </p>
          <div className="flex flex-wrap gap-2">
            {scenarios.length === 0 ? (
              <span className="text-[12px] text-x-secondary">Loading scenarios…</span>
            ) : (
              scenarios.map((sc) => {
                const busy = busyScenario === sc.id;
                return (
                  <button
                    key={sc.id}
                    onClick={() => onInject(sc.id)}
                    disabled={!!busyScenario}
                    title={sc.description}
                    className="group flex items-center gap-2 rounded-full border border-x-border bg-x-elevated hover:border-x-accent/60 hover:bg-x-accent/10 px-3 py-1.5 transition-colors disabled:opacity-50 disabled:hover:border-x-border disabled:hover:bg-x-elevated"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        busy ? "bg-x-accent live-dot" : "bg-x-secondary group-hover:bg-x-accent"
                      }`}
                    />
                    <span className="text-[13px] font-semibold text-x-primary">{sc.label}</span>
                    <span className="data-label text-x-secondary group-hover:text-x-accent">
                      {sc.handle.replace("@", "")}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
};
