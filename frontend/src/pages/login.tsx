import { useState } from 'react';
import { login } from '@/services/api';

export default function LoginPage({ onSuccess }: {
  onSuccess: (user: { id: string; email: string }, token: string) => Promise<void> | void
}) {
  const [email, setEmail] = useState('alice@test.com');
  const [password, setPassword] = useState('Passw0rd!');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { token, user } = await login(email, password);
      await onSuccess(user, token);
    } catch (e: any) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Login</h1>
      <input className="border px-2 py-1 w-64" value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" />
      <input className="border px-2 py-1 w-64" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="password" />
      <button className="border px-3 py-1" disabled={loading}>{loading ? 'Signing in...' : 'Sign in'}</button>
      {err && <div className="text-red-600 text-sm">{err}</div>}
    </form>
  );
}
