import React from "react";

/**
 * Elegant repeating patterns (data-URI SVGs).
 * Variants: "moroccan" | "mini-cross" | "rosette"
 *
 * Colors are soft so message text stays readable.
 * You can tweak stroke/fill by editing the SVG strings below.
 */

type Variant = "moroccan" | "mini-cross" | "rosette";

function svgToDataURI(svg: string) {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

function getPattern(variant: Variant) {
  // Base tone similar to WhatsApp paper
  const paper = "#ece5dd";

  switch (variant) {
    case "moroccan": {
      // Moroccan lattice / ogee style (very subtle)
      const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'>
          <rect width='56' height='56' fill='${paper}'/>
          <path d='M28 4c-6 0-9 4-12 7s-6 5-10 5
                   m44 0c-4 0-7-2-10-5s-6-7-12-7
                   m0 48c6 0 9-4 12-7s6-5 10-5
                   m-44 0c4 0 7 2 10 5s6 7 12 7'
                fill='none' stroke='#cbbfae' stroke-opacity='.55' stroke-width='1.2'/>
        </svg>`;
      return { bg: svgToDataURI(svg), base: paper };
    }

    case "mini-cross": {
      // Small plus/cross grid with gentle fade vibe
      const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'>
          <rect width='22' height='22' fill='${paper}'/>
          <g stroke='#c4beb5' stroke-opacity='.45' stroke-width='1'>
            <path d='M11 6 v2'/>
            <path d='M11 14 v2'/>
            <path d='M6 11 h2'/>
            <path d='M14 11 h2'/>
          </g>
        </svg>`;
      return { bg: svgToDataURI(svg), base: paper };
    }

    case "rosette": {
      // Small rosette/flower motif
      const svg = `
        <svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'>
          <rect width='40' height='40' fill='${paper}'/>
          <g fill='none' stroke='#d0c6b8' stroke-width='1' stroke-opacity='.55'>
            <circle cx='20' cy='20' r='5'/>
            <path d='M20 10 v-3 M20 33 v-3 M10 20 h-3 M33 20 h-3'/>
            <path d='M14 14 l-2-2 M28 28 l-2-2 M14 26 l-2 2 M28 12 l-2 2'/>
          </g>
        </svg>`;
      return { bg: svgToDataURI(svg), base: paper };
    }
  }
}

export default function ChatWallpaper({ variant = "moroccan" }: { variant?: Variant }) {
  const { bg } = getPattern(variant);
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-30"
      style={{
        backgroundImage: bg,
        backgroundRepeat: "repeat",
        backgroundSize: "auto",
      }}
      aria-hidden="true"
    />
  );
}
