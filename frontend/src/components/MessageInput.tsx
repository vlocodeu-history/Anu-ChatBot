// frontend/src/components/MessageInput.tsx
import { useRef, useState } from 'react';
import { uploadFile } from '@/services/api';

type Props = {
  onSend(text: string): void;
  disabled?: boolean; // parent controls (e.g., no peer key yet)
};

const EMOJI_SET = [
  '😀','😁','😂','🤣','😊','😍','😘','😎','🤩','🥳',
  '👍','👏','🙏','💪','🔥','✨','🎉','❤️','💖','😇',
];

export default function MessageInput({ onSend, disabled = false }: Props) {
  const [value, setValue] = useState('');
  const [openEmoji, setOpenEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const doSend = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSend();
    }
  };

  const pickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { url } = await uploadFile(f);
      // simple: send the link as a message; you can switch to attachments later
      onSend(url);
    } catch {
      // uploadFile already alerts if endpoint missing
    } finally {
      e.target.value = '';
    }
  };

  const insertEmoji = (emo: string) => {
    setValue((v) => v + emo);
    setOpenEmoji(false);
  };

  return (
    <div className="relative z-20 h-[72px] bg-white dark:bg-slate-900 border-t dark:border-slate-800 px-3 flex items-center gap-2">
      {/* Attach */}
      <button
        type="button"
        className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        title="Attach"
        onClick={pickFile}
        disabled={disabled}
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
      <div className="relative">
        <button
          type="button"
          className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          title="Emoji"
          onClick={() => setOpenEmoji((s) => !s)}
          disabled={disabled}
        >
          😊
        </button>

        {openEmoji && !disabled && (
          <div
            className="absolute bottom-12 left-0 grid grid-cols-10 gap-1 p-2 rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-700 shadow-2xl"
            style={{ width: 320 }}
          >
            {EMOJI_SET.map((e) => (
              <button
                key={e}
                type="button"
                className="h-8 w-8 text-lg rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => insertEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <input
        className="flex-1 h-11 rounded-full px-4 border dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? 'Waiting for peer to be online…' : 'Type a message…'}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />

      {/* Send */}
      <button
        type="button"
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        onClick={doSend}
        disabled={disabled || !value.trim()}
      >
        Send
      </button>
    </div>
  );
}
