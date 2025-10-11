// frontend/src/components/MessageInput.tsx
import { useRef, useState } from 'react';
import { uploadFile } from '@/services/api';

export default function MessageInput({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const [value, setValue] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const send = () => {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') send();
  };

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { url } = await uploadFile(f);
      if (url) onSend(url); // send URL as message
      else alert('Upload flow not available (no Supabase).');
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || 'Upload failed');
    } finally {
      e.target.value = '';
    }
  };

  const addEmoji = (emoji: string) => setValue((p) => `${p}${emoji}`);

  return (
    <div className="h-[72px] bg-white dark:bg-slate-900 border-t px-3 flex items-center gap-2">
      <button
        className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
        title="Attach file"
        onClick={pickFile}
        disabled={disabled}
      >
        📎
      </button>
      <button
        className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800"
        title="Emoji"
        onClick={() => addEmoji('😊')}
        disabled={disabled}
      >
        😊
      </button>
      <input
        className="flex-1 h-11 rounded-full px-4 border dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        placeholder="Type a message…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
      />
      <button
        className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
        onClick={send}
        disabled={disabled}
      >
        Send
      </button>
      <input ref={fileRef} type="file" className="hidden" onChange={onFile} />
    </div>
  );
}
