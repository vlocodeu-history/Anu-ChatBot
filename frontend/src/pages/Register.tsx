import { useState } from 'react';
import { register } from '@/services/api';

export default function RegisterPage({
  onSuccess,
}: {
  onSuccess: (user: { id: string; email: string }, token: string) => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);

    if (!email.trim()) return setErr('Please enter an email.');
    if (password.length < 8) return setErr('Password must be at least 8 characters.');
    if (password !== confirm) return setErr('Passwords do not match.');

    setLoading(true);
    try {
      const { token, user } = await register({ email: email.trim(), password });
      await onSuccess(user, token);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Create account</h1>

      <input
        className="border px-2 py-1 w-64"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        type="email"
        autoComplete="email"
      />

      <input
        className="border px-2 py-1 w-64"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password (min 8 chars)"
        autoComplete="new-password"
      />

      <input
        className="border px-2 py-1 w-64"
        type="password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        placeholder="confirm password"
        autoComplete="new-password"
      />

      <button className="border px-3 py-1" disabled={loading}>
        {loading ? 'Creating...' : 'Create account'}
      </button>

      {err && <div className="text-red-600 text-sm">{err}</div>}
    </form>
  );
}
