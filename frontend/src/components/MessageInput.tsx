// frontend/src/components/MessageInput.tsx
import { useRef, useState } from 'react';
import api from '@/services/api'; // used for baseURL if we fall back to fetch

type Props = {
  disabled?: boolean;
  onSend: (text: string) => void;
};

export default function MessageInput({ disabled, onSend }: Props) {
  const [value, setValue] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const send = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  };

  const addEmoji = () => {
    if (disabled) return;
    setValue((v) => `${v}🙂`);
  };

  const chooseFile = () => {
    if (disabled) return;
    fileRef.current?.click();
  };

  const doUpload = async (file: File) => {
    try {
      // prefer a typed client if you added one; otherwise edge-safe fetch
      const form = new FormData();
      form.append('file', file);

      let url = '';
      // try axios instance if it has .post; else fallback to fetch
      try {
        const { data } = await (api as any).post('/api/files/upload', form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        });
        url = data?.url || '';
      } catch {
        const base = (api as any)?.defaults?.baseURL || import.meta.env.VITE_API_URL;
        const res = await fetch(`${base}/api/files/upload`, {
          method: 'POST',
          body: form,
        });
        const data = await res.json();
        url = data?.url || '';
      }

      if (!url) {
        alert('Upload failed: server did not return a URL.');
        return;
      }

      // send URL as a message (simple approach)
      onSend(url);
    } catch (e) {
      console.error('upload error:', e);
      alert('Upload failed.');
    }
  };

  return (
    <div className="h-[72px] bg-white dark:bg-slate-900 border-t dark:border-slate-800 px-3 flex items-center gap-2">
      <button
        className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        title="Attach"
        onClick={chooseFile}
        disabled={disabled}
      >
        📎
      </button>
      <button
        className="px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
        title="Emoji"
        onClick={addEmoji}
        disabled={disabled}
      >
        😊
      </button>

      <input
        className="flex-1 h-11 rounded-full px-4 border dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={disabled ? 'Waiting for peer to be online…' : 'Type a message…'}
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

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) doUpload(f);
          // clear the input so the same file can be selected again later
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
    </div>
  );
}
