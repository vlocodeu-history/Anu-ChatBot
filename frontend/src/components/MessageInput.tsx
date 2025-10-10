import { useRef, useState, Suspense, lazy } from 'react';

/**
 * Lazy-load Emoji Mart so initial bundle stays small.
 * Install first:
 *   npm i @emoji-mart/react @emoji-mart/data
 */
const EmojiPicker = lazy(() => import('@emoji-mart/react'));
import data from '@emoji-mart/data';

export type MessageInputProps = {
  onSend: (text: string, file?: File) => void;
  disabled?: boolean;
};

export default function MessageInput({ onSend, disabled }: MessageInputProps) {
  const [text, setText] = useState('');
  const [openEmoji, setOpenEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || disabled) return;
    // You can encrypt & upload file here later. For now we just pass it up.
    onSend(`[file] ${f.name}`, f);
    e.currentTarget.value = '';
  };

  return (
    <div className="relative h-[72px] bg-white border-t px-3 flex items-center gap-2">
      {/* Hidden file input */}
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />

      {/* Attach */}
      <button
        type="button"
        title="Attach"
        onClick={() => fileRef.current?.click()}
        className="hidden md:inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-50"
        aria-label="Attach"
      >
        📎
      </button>

      {/* Emoji */}
      <div className="relative hidden md:block">
        <button
          type="button"
          title="Emoji"
          onClick={() => setOpenEmoji(v => !v)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-slate-600 hover:bg-slate-50"
          aria-haspopup="dialog"
          aria-expanded={openEmoji}
          aria-label="Emoji"
        >
          😊
        </button>

        {openEmoji && (
          <div className="absolute bottom-12 left-0 z-50">
            <Suspense fallback={<div className="rounded-md border bg-white p-3 text-sm text-slate-500">Loading…</div>}>
              {/* @ts-ignore - types from emoji-mart are relaxed */}
              <EmojiPicker
                data={data}
                theme="light"
                onEmojiSelect={(e: any) => {
                  const native = e?.native || '';
                  if (native) setText(t => t + native);
                  setOpenEmoji(false);
                }}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* Input */}
      <input
        className="flex-1 h-11 rounded-full px-4 border focus:outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="Type a message…"
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />

      {/* Send */}
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled}
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
      >
        Send
      </button>
    </div>
  );
}
