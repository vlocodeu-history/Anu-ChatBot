// src/pages/login.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios, { AxiosError } from 'axios';

type User = { id: string; email: string; name?: string };

function baseUrl() {
  const url = import.meta.env.VITE_API_URL as string | undefined;
  if (!url) throw new Error('VITE_API_URL is not set');
  // Normalize (no trailing slash)
  return url.replace(/\/+$/, '');
}

export default function LoginPage() {
  const [email, setEmail] = useState('alice@test.com');
  const [password, setPassword] = useState('Passw0rd!'); // backend ignores it in the demo
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      // Demo backend expects { email }, password is ignored
      const { data } = await axios.post<{ token: string; user: User }>(
        `${baseUrl()}/api/auth/login`,
        { email },
        { withCredentials: true }
      );

      localStorage.setItem('token', data.token);
      localStorage.setItem('me', JSON.stringify({ id: data.user.id, email: data.user.email }));

      // navigate client-side (no full page reload)
      navigate('/chat', { replace: true });
    } catch (e: unknown) {
      const ax = e as AxiosError<any>;
      const msg =
        ax.response?.data?.error ||
        ax.response?.statusText ||
        ax.message ||
        String(e);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-4 space-y-3">
      <h1 className="text-xl font-semibold">Login</h1>

      <input
        className="border px-2 py-1 w-64"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        autoComplete="username"
      />

      <input
        className="border px-2 py-1 w-64"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="password"
        autoComplete="current-password"
      />

      <button className="border px-3 py-1" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>

      {err && <div className="text-red-600 text-sm">{err}</div>}

      <div className="text-xs text-gray-500">
        Tip: set <code>VITE_API_URL</code> to your backend origin, e.g.{' '}
        <code>https://anu-chatbot.onrender.com</code>
      </div>
    </form>
  );
}
