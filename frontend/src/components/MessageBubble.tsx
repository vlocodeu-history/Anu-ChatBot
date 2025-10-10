import React from 'react';

type Status = 'pending' | 'delivered' | 'failed';

export default function MessageBubble({
  side,
  text,
  time,
  status,
}: {
  side: 'left' | 'right';
  text: string;
  time: string;
  status?: Status;
}) {
  const isMe = side === 'right';

  const statusColor =
    status === 'delivered' ? 'bg-emerald-500' :
    status === 'failed'    ? 'bg-red-500'     :
    'bg-orange-400'; // pending/default

  return (
    <div className={`message-bubble flex ${isMe ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[72%] rounded-2xl px-3 py-2 shadow-sm relative ${
          isMe ? 'bg-emerald-100' : 'bg-white'
        }`}
      >
        <div className="text-[15px] leading-relaxed break-words">{text}</div>

        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
          <span>{time}</span>
          {/* status dot only, no text */}
          {status && <span className={`inline-block w-2 h-2 rounded-full ${statusColor}`} />}
        </div>
      </div>
    </div>
  );
}
