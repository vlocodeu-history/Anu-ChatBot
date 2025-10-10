import React from 'react';

type Status = 'pending' | 'delivered' | 'failed';

type Props = {
  side: 'left' | 'right';
  text: string;
  time: string;
  status?: Status;
};

export default function MessageBubble({ side, text, time, status }: Props) {
  const mine = side === 'right';

  const dot =
    status === 'delivered'
      ? 'bg-green-500'
      : status === 'failed'
      ? 'bg-red-500'
      : 'bg-orange-400'; // pending

  return (
    <div className={`message-bubble max-w-[70%] ${mine ? 'ml-auto' : ''}`}>
      <div className={`rounded-xl px-3 py-2 shadow-sm ${mine ? 'bg-emerald-100' : 'bg-white'}`}>
        <div className="text-[15px] whitespace-pre-wrap break-words">{text}</div>
        <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-2">
          <span>{time}</span>
          {status && <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-label={status} />}
        </div>
      </div>
    </div>
  );
}

