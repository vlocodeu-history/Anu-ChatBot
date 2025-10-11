import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttach?: (file: File) => void;
  disabled?: boolean;
};

const EMOJIS = [
  '😀','😁','😂','🤣','😊','😍','😘','😜','🤗','🤔',
  '👍','👏','🙏','🔥','💯','✅','❌','🎉','🥳','✨',
  '😎','😇','😉','😴','🤝','🥰','🙌','🤩','😅','🤤',
];

export default function MessageInput({
  value,
  onChange,
  onSend,
  onAttach,
  disabled,
}: Props) {
  const [showEmoji, setShowEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // close emoji panel when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (wrapRef.current.contains(e.target as Node)) return;
      setShowEmoji(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pickEmoji(ch: string) {
    onChange(value + ch);
  }

  function openFile() {
    if (fileRef.current) fileRef.current.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && onAttach) onAttach(f);
    // reset so picking same file again still triggers change
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div ref={wrapRef} className="h-[72px] bg-white border-t px-2 md:px-3 flex items-center gap-1 md:gap-2 relative">
      {/* Attach */}
      <button
        title="Attach"
        aria-label="Attach"
        className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600"
        onClick={openFile}
        type="button"
      >
        📎
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
      />

      {/* Emoji */}
      <button
        title="Emoji"
        aria-label="Emoji"
        className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600"
        onClick={() => setShowEmoji((s) => !s)}
        type="button"
      >
        😊
      </button>

      {/* Input */}
      <input
        className="flex-1 h-11 rounded-full px-4 border focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a message…"
        onKeyDown={(e) => { if (e.key === 'Enter') onSend(); }}
        disabled={disabled}
      />

      {/* Send */}
      <button
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        onClick={onSend}
        disabled={disabled}
        type="button"
      >
        Send
      </button>

      {/* Emoji panel */}
      {showEmoji && (
        <div className="absolute bottom-[76px] left-0 md:left-20 z-20 w-[280px] rounded-xl border bg-white shadow-lg p-2 grid grid-cols-8 gap-1">
          {EMOJIS.map((e, i) => (
            <button
              key={i}
              className="text-xl leading-none p-1 hover:bg-slate-100 rounded"
              onClick={() => pickEmoji(e)}
              type="button"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
