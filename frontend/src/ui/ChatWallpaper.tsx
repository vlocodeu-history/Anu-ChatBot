import React from 'react';

type Props = {
  /** pick one: 'moroccan' | 'dots' | 'leafy' */
  variant?: 'moroccan' | 'dots' | 'leafy';
  /** overall opacity (0..1) */
  opacity?: number;
};

/**
 * Non-interactive decorative wallpaper for the chat pane.
 * Renders an inline SVG pattern so there are no external assets / CORS issues.
 */
export default function ChatWallpaper({ variant = 'moroccan', opacity = 0.22 }: Props) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0"
      style={{ opacity }}
    >
      {variant === 'moroccan' && <Moroccan />}
      {variant === 'dots' && <Dots />}
      {variant === 'leafy' && <Leafy />}
    </div>
  );
}

/* --- Variants ---------------------------------------------------- */

function Moroccan() {
  // light-beige paper tone like WhatsApp
  return (
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="moroccan-ptn" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#ece5dd" />
          <path
            d="M30 4c6 6 14 6 20 0 6 6 6 14 0 20 6 6 6 14 0 20-6-6-14-6-20 0-6-6-14-6-20 0-6-6-6-14 0-20-6-6-6-14 0-20 6 6 14 6 20 0z"
            fill="none"
            stroke="#d8cfc5"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#moroccan-ptn)" />
    </svg>
  );
}

function Dots() {
  return (
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="dots-ptn" width="24" height="24" patternUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#f3efe7" />
          <circle cx="12" cy="12" r="1.6" fill="#d4c9bc" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dots-ptn)" />
    </svg>
  );
}

function Leafy() {
  return (
    <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="leafy-ptn" width="140" height="120" patternUnits="userSpaceOnUse">
          <rect width="140" height="120" fill="#f1ebe3" />
          <g opacity="0.6" stroke="#e0d6cb" fill="none" strokeWidth="1">
            <path d="M20 80 C50 40, 90 40, 120 80" />
            <path d="M20 70 C50 30, 90 30, 120 70" />
            <circle cx="38" cy="62" r="2.5" fill="#dfd4c7" />
            <circle cx="76" cy="48" r="2.5" fill="#dfd4c7" />
            <circle cx="104" cy="65" r="2.5" fill="#dfd4c7" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#leafy-ptn)" />
    </svg>
  );
}
