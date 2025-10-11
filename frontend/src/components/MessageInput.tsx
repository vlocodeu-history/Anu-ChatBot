// src/components/MessageInput.tsx
import { useEffect, useRef, useState } from 'react';

type Props = {
  onSend: (text: string) => void;
  disabled?: boolean;
};

export default function MessageInput({ onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const emojiRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmoji(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText('');
    setShowEmoji(false);
  };

  const addEmoji = (ch: string) => setText((t) => t + ch);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    // In this minimal build we don’t upload; UX hint only.
    alert(`Picked file: ${f.name} (${Math.round(f.size / 1024)} KB)\n\nUpload flow is not wired in this build.`);
    setShowAttach(false);
    e.target.value = '';
  };

  return (
    <div className="h-[72px] bg-white border-t px-2 md:px-3 flex items-center gap-2 relative">
      {/* Attach */}
      <div className="relative">
        <button
          className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600 disabled:opacity-50"
          title="Attach"
          onClick={() => setShowAttach((v) => !v)}
          disabled={disabled}
        >
          📎
        </button>
        {showAttach && (
          <div className="absolute bottom-12 left-0 z-20 bg-white shadow-lg border rounded-md p-2 w-48">
            <button
              className="w-full text-left px-2 py-1 rounded hover:bg-slate-50"
              onClick={() => fileRef.current?.click()}
            >
              Upload file…
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={onFilePick} />
          </div>
        )}
      </div>

      {/* Emoji */}
      <div className="relative" ref={emojiRef}>
        <button
          className="px-3 py-2 rounded hover:bg-slate-50 text-slate-600 disabled:opacity-50"
          title="Emoji"
          onClick={() => setShowEmoji((v) => !v)}
          disabled={disabled}
        >
          😊
        </button>
        {showEmoji && (
          <div className="absolute bottom-12 left-0 z-20 bg-white shadow-lg border rounded-md p-2 grid grid-cols-8 gap-1 w-64">
            {['😀','😁','😂','🤣','😊','😍','😘','😎','😜','🤗','👍','👏','🙏','💪','✨','🎉','🔥','❤️','💙','💚','💛','💜','🧡','🤍','🤎','🖤','🐞','🦋','🌟','🍀','🍕','☕️','🚀','📎','💬'].map(e => (
              <button key={e} className="hover:bg-slate-50 rounded" onClick={() => addEmoji(e)}>{e}</button>
            ))}
          </div>
        )}
      </div>

      {/* Text input */}
      <input
        className="flex-1 h-11 rounded-full px-4 border focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-100"
        placeholder="Type a message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        disabled={disabled}
      />

      {/* Send */}
      <button
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        onClick={send}
        disabled={disabled}
      >
        Send
      </button>
    </div>
  );
}
