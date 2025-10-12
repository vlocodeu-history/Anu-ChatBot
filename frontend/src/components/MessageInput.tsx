// frontend/src/components/MessageInput.tsx
import { useRef, useState } from "react";
import { uploadFile } from "@/services/api";

export default function MessageInput({
  disabled,
  onSend,
}: {
  disabled?: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };

  const pickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset
    if (!file) return;
    setBusy(true);
    try {
      const { url, name } = await uploadFile(file);
      // put both url + name into the message so it decrypts as a readable link
      const msg = `[file:${name}] ${url}`;
      onSend(msg);
    } catch (err) {
      console.error("upload failed", err);
      // you can surface a toast here
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-3 border-t dark:border-slate-800 flex items-center gap-2">
      <button
        type="button"
        className="px-2 py-1 rounded border dark:border-slate-700 text-sm"
        onClick={pickFile}
        disabled={disabled || busy}
        title="Attach file"
      >
        📎
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        onChange={onFileChange}
      />
      <input
        className="flex-1 border dark:border-slate-700 rounded px-3 py-2 bg-white dark:bg-slate-900"
        placeholder={disabled ? "Select a contact to start…" : "Type a message…"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled || busy}
      />
      <button
        className="px-4 py-2 rounded bg-emerald-600 text-white disabled:opacity-50"
        disabled={disabled || busy}
      >
        Send
      </button>
    </form>
  );
}
