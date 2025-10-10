// src/ui/ContactItem.tsx
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
  const initials = title?.charAt(0)?.toUpperCase() || 'U';
  return (
    <li
      onClick={onClick}
      className={[
        'px-3 py-3 border-b cursor-pointer select-none',
        'hover:bg-emerald-50 transition',
        active ? 'bg-emerald-100/60' : 'bg-white',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-600/90 text-white grid place-content-center text-sm font-semibold">
          {initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          {subtitle && <div className="text-xs text-slate-500 truncate">{subtitle}</div>}
        </div>
      </div>
    </li>
  );
}
