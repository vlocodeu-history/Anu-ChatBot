// src/ui/MessageBubble.tsx
export default function MessageBubble({
  side, // 'left' | 'right'
  text,
  time,
  delivered,
}: {
  side: 'left' | 'right';
  text: string;
  time: string;
  delivered?: boolean;
}) {
  const mine = side === 'right';
  return (
    <div className={`message-bubble w-full flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[72%] rounded-2xl px-3 py-2 shadow-sm',
          mine ? 'bg-emerald-100' : 'bg-white',
        ].join(' ')}
      >
        <div className="text-[15px] break-words">{text}</div>
        <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
          {time}
          {delivered && <span className="uppercase tracking-wide">Delivered</span>}
        </div>
      </div>
    </div>
  );
}
