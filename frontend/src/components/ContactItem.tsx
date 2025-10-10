import React from 'react';

export default function ContactItem({
  title,
  subtitle,
  active,
  onClick,
}: {
  title: string;
  subtitle?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const initial = (title?.[0] || subtitle?.[0] || 'U').toUpperCase();

  return (
    <li
      className={`px-3 py-3 cursor-pointer border-b hover:bg-emerald-50 ${
        active ? 'bg-emerald-100/60' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* avatar */}
        <div className="w-9 h-9 rounded-full bg-emerald-600/90 text-white grid place-content-center text-sm font-semibold">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
        </div>
      </div>
    </li>
  );
}
