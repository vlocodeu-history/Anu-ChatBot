import React from 'react';

/**
 * Decorative background for the chat pane.
 * It’s an inline SVG so you don’t need assets/CDN.
 * Subtle opacity keeps bubbles readable.
 */
export default function ChatWallpaper() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 w-full h-full opacity-25"
      viewBox="0 0 1440 900"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* Base tint */}
      <rect width="1440" height="900" fill="#ece5dd" />

      {/* Organic blobs */}
      <g>
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f7c8b4" />
            <stop offset="100%" stopColor="#f2b79f" />
          </linearGradient>
          <linearGradient id="g2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d8e9e4" />
            <stop offset="100%" stopColor="#bfe0d7" />
          </linearGradient>
          <linearGradient id="g3" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e5d3c8" />
            <stop offset="100%" stopColor="#dac2b4" />
          </linearGradient>
        </defs>

        <path
          d="M0,120 C200,60 320,140 420,120 C540,95 640,20 760,60 C910,110 980,260 1140,260 C1250,260 1340,210 1440,140 L1440,0 L0,0 Z"
          fill="url(#g1)"
          opacity="0.35"
        />
        <path
          d="M0,900 L0,720 C130,760 250,720 360,660 C510,580 620,560 760,600 C980,660 1120,610 1240,540 C1310,500 1390,460 1440,470 L1440,900 Z"
          fill="url(#g2)"
          opacity="0.35"
        />
        <path
          d="M1080,0 C1160,120 1220,200 1320,260 C1380,300 1410,330 1440,360 L1440,0 Z"
          fill="url(#g3)"
          opacity="0.35"
        />
      </g>

      {/* Minimal leaves/dots */}
      <g opacity="0.55">
        {/* stems */}
        <path d="M170 520 C 210 460, 260 460, 300 520" stroke="#9ac8bd" strokeWidth="6" fill="none" />
        <path d="M240 560 C 280 500, 330 500, 370 560" stroke="#f1b266" strokeWidth="6" fill="none" />

        {/* leaves */}
        <ellipse cx="230" cy="505" rx="8" ry="18" fill="#4fa58a" />
        <ellipse cx="260" cy="490" rx="8" ry="18" fill="#4fa58a" transform="rotate(-25 260 490)" />
        <ellipse cx="285" cy="495" rx="8" ry="18" fill="#4fa58a" transform="rotate(20 285 495)" />
        <ellipse cx="315" cy="510" rx="8" ry="18" fill="#4fa58a" transform="rotate(-10 315 510)" />

        {/* dots */}
        <circle cx="1000" cy="150" r="6" fill="#6ac3aa" />
        <circle cx="1030" cy="165" r="5" fill="#6ac3aa" />
        <circle cx="1010" cy="185" r="4" fill="#6ac3aa" />
      </g>
    </svg>
  );
}
