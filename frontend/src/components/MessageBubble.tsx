export type MessageBubbleProps = {
  mine?: boolean;
  text: string;
  time: string;   // already formatted
  status?: "sending" | "queued" | "delivered" | "read";
};

export default function MessageBubble({
  mine,
  text,
  time,
  status,
}: MessageBubbleProps) {
  return (
    <div className={`w-full flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={[
          "max-w-[75%] rounded-lg px-3 py-2 text-[15px] shadow-sm",
          mine ? "bg-chat-me" : "bg-chat-them",
        ].join(" ")}
      >
        <div className="whitespace-pre-wrap break-words">{text}</div>

        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500 justify-end">
          <span>{time}</span>
          {status && (
            <span className="uppercase tracking-wide">
              {status === "sending" ? "…" : status}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
