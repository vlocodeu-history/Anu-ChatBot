// frontend/src/components/MessageInput.tsx
import { useEffect, useRef, useState } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttachFiles?: (files: File[]) => void;
  disabled?: boolean;
};

const EMOJIS = [
  '😀','😁','😂','🤣','😊','😇','🙂','😉','😍','😘','😜','🤪',
  '👍','👏','🙌','🔥','💯','🎉','🥳','❤️','💙','💚','💛','💜',
];

export default function MessageInput({
  value,
  onChange,
  onSend,
  onAttachFiles,
  disabled,
}: Props) {
  const [showEmoji, setShowEmoji] = useState(false);
  const emojiBtnRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // close emoji popover when clicking outside
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (!popoverRef.current || !showEmoji) return;
      if (
        popoverRef.current.contains(t) ||
        emojiBtnRef.current?.contains(t)
      ) return;
      setShowEmoji(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showEmoji]);

  function addEmoji(e: string) {
    onChange(value + e);
  }

  function pickFiles() {
    fileRef.current?.click();
  }

  function onFilesChosen(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files || []);
    if (!files.length) return;
    onAttachFiles?.(files);
    // reset so choosing same file again still fires change
    ev.target.value = '';
  }

  return (
    <div className="h-[72px] bg-white border-t px-3 flex items-center gap-2 relative">
      {/* Attach */}
      <button
        type="button"
        title="Attach"
        className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600"
        onClick={pickFiles}
        aria-label="Attach a file"
      >
        📎
      </button>
      <input
        ref={fileRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFilesChosen}
      />

      {/* Emoji */}
      <button
        ref={emojiBtnRef}
        type="button"
        title="Emoji"
        className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600"
        onClick={() => setShowEmoji(v => !v)}
        aria-expanded={showEmoji}
        aria-controls="emoji-popover"
      >
        😊
      </button>

      {/* Input */}
      <input
        className="flex-1 h-11 rounded-full px-4 border focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Type a message…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!disabled) onSend();
          }
        }}
        disabled={disabled}
      />

      {/* Send */}
      <button
        type="button"
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        onClick={onSend}
        disabled={disabled}
      >
        Send
      </button>

      {/* Emoji popover */}
      {showEmoji && (
        <div
          id="emoji-popover"
          ref={popoverRef}
          className="absolute bottom-16 left-16 z-20 w-72 max-w-[80vw] rounded-xl border bg-white shadow-lg p-2 grid grid-cols-8 gap-2"
        >
          {EMOJIS.map((e) => (
            <button
              key={e}
              className="h-8 w-8 grid place-content-center rounded hover:bg-slate-100"
              onClick={() => addEmoji(e)}
              type="button"
              aria-label={`Insert ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
