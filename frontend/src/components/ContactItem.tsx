export type ContactItemProps = {
  selected?: boolean;
  title: string;
  subtitle?: string;
  onClick?: () => void;
};

export default function ContactItem({
  selected,
  title,
  subtitle,
  onClick,
}: ContactItemProps) {
  return (
    <button
      onClick={onClick}
      className={[
        "w-full text-left px-4 py-3 flex flex-col gap-0.5",
        "hover:bg-black/5 focus:bg-black/5 outline-none",
        selected ? "bg-black/5" : "",
        "border-b border-black/5",
      ].join(" ")}
    >
      <div className="font-medium text-gray-900 truncate">{title}</div>
      {subtitle && (
        <div className="text-xs text-gray-500 truncate">{subtitle}</div>
      )}
    </button>
  );
}
