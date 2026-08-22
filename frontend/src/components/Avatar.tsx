"use client";

import React, { useState } from "react";

interface AvatarProps {
  src?: string | null;
  name: string;
  className?: string;
  alt?: string;
}

export const Avatar: React.FC<AvatarProps> = ({ src, name, className = "w-8 h-8", alt = "" }) => {
  const [errored, setErrored] = useState(false);

  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  if (errored || !src) {
    return (
      <div
        aria-hidden="true"
        className={`${className} rounded-full bg-x-elevated-2 text-x-primary font-semibold text-[13px] leading-none flex items-center justify-center shrink-0 select-none`}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setErrored(true)}
      className={`${className} rounded-full object-contain bg-white p-0.5 shrink-0`}
    />
  );
};