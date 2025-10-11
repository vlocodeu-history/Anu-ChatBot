// frontend/src/components/LiquidEther.tsx
import React from 'react';

/**
 * LiquidEther — animated, soft “neon blobs” background
 * - Renders behind your chat messages
 * - Very light opacity for readability
 */
export default function LiquidEther({
  intensity = 0.7, // 0..1 opacity strength
}: { intensity?: number }) {
  const alpha = Math.max(0, Math.min(1, intensity));

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        // subtle base tint (like WhatsApp sand, but cooler)
        background:
          'radial-gradient(1200px 600px at 10% -10%, rgba(40,30,60,.08), transparent 60%), radial-gradient(1000px 500px at 110% 10%, rgba(30,60,80,.06), transparent 60%)',
      }}
    >
      {/* Blobs */}
      <span
        className="le-blob le-blob-a"
        style={{ opacity: alpha, background: 'radial-gradient(circle at 30% 30%, rgba(110,85,255,.9), rgba(110,85,255,0) 60%)' }}
      />
      <span
        className="le-blob le-blob-b"
        style={{ opacity: alpha, background: 'radial-gradient(circle at 70% 60%, rgba(255,80,180,.85), rgba(255,80,180,0) 60%)' }}
      />
      <span
        className="le-blob le-blob-c"
        style={{ opacity: alpha * 0.9, background: 'radial-gradient(circle at 50% 50%, rgba(0,200,220,.8), rgba(0,200,220,0) 60%)' }}
      />

      {/* Soft noise veil for depth (very faint) */}
      <div className="absolute inset-0 opacity-[0.06] mix-blend-overlay le-noise" />
    </div>
  );
}
