"use client";

import { useEffect, useState } from "react";
import { GhibliRobotHero } from "@/components/ui/ghibli-robot-hero";

/** True while the viewport is narrow. Drives the crop and the copy width below. */
function useNarrow(query = "(max-width: 767px)") {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query);
    const sync = () => setNarrow(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, [query]);
  return narrow;
}

/**
 * A wide, bright landscape from Unsplash — top third quiet, which is where the
 * words go. Swap it for your own picture; the hero runs the full height of the
 * screen, so a large file is not a luxury. `sources` hands the browser a few
 * widths of the same image so a phone is not made to fetch the desktop file.
 */
const IMG = "https://images.unsplash.com/photo-1506905925346-21bda4d32df4";
const src = (w: number) => `${IMG}?q=80&auto=format&fit=crop&w=${w}`;

/** A small mark for the button. Inline, so the demo pulls in no icon package. */
function SparkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.5l1.9 5.9a4 4 0 0 0 2.6 2.6l5.9 1.9-5.9 1.9a4 4 0 0 0-2.6 2.6L12 23.4l-1.9-5.9a4 4 0 0 0-2.6-2.6L1.6 12.9l5.9-1.9a4 4 0 0 0 2.6-2.6L12 2.5z" />
    </svg>
  );
}

/**
 * The picture does most of the work here, so the copy stays out of its way:
 * one line of headline, one line under it, one button.
 *
 * Two settings do the fitting. `focus` holds the horizon in frame however the
 * section is cropped — a landscape cut to a hero loses its top and bottom
 * first, and the default centre crop would throw away the sky. `lead` puts the
 * block at just under a third down, which lands the headline in open sky and
 * the button clear of the far ridge. A phone crops the same picture hard, so
 * there the frame slides and the copy rides higher.
 */
export default function GhibliRobotHeroDemo() {
  const narrow = useNarrow();

  return (
    <GhibliRobotHero
      image={src(2600)}
      sources={[
        { src: src(1200), width: 1200 },
        { src: src(2000), width: 2000 },
        { src: src(2600), width: 2600 },
      ]}
      imageAlt="A still mountain lake under tall summer clouds"
      focus={narrow ? "38% 64%" : "62% 58%"}
      lead={narrow ? 0.34 : 0.42}
      scrim={0.4}
      title="Humanoid robots for outdoor work"
      subtitle="Farms, substations, building sites."
      ctaLabel="Automate the outdoors"
      ctaIcon={<SparkIcon />}
    />
  );
}
