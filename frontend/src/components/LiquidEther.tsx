import React, { useEffect, useRef } from 'react';

type Props = {
  className?: string;
  opacity?: number;       // 0..1
  colors?: string[];      // gradient stops
  blur?: number;          // px
};

export default function LiquidEther({
  className = '',
  opacity = 0.7,
  colors = ['#0b0b0f', '#1a0b1f', '#ff2d9a'], // black -> deep purple -> dark pink
  blur = 60,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.setProperty('--ether-opacity', String(opacity));
    ref.current.style.setProperty('--ether-blur', `${blur}px`);
    ref.current.style.setProperty('--ether-c1', colors[0] || '#0b0b0f');
    ref.current.style.setProperty('--ether-c2', colors[1] || '#1a0b1f');
    ref.current.style.setProperty('--ether-c3', colors[2] || '#ff2d9a');
  }, [opacity, colors, blur]);

  return (
    <div
      ref={ref}
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{
        background:
          'radial-gradient(40% 60% at 15% 20%, var(--ether-c3) 0%, transparent 60%),' +
          'radial-gradient(35% 50% at 85% 30%, var(--ether-c2) 0%, transparent 60%),' +
          'radial-gradient(60% 80% at 50% 80%, var(--ether-c1) 0%, transparent 70%)',
        filter: 'saturate(120%)',
        opacity: 'var(--ether-opacity)',
        backdropFilter: `blur(var(--ether-blur))`,
      }}
    />
  );
}
