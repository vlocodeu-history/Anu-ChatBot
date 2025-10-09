// src/pages/login.tsx
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { login } from '@/services/api';

type User = { id: string; email: string; name?: string };

export default function LoginPage() {
  const [email, setEmail] = useState('alice@test.com');
  const [password, setPassword] = useState('Passw0rd!');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      // Send password so Supabase/real users can log in; demo users can still work server-side
      const { token, user } = await login(email, password);
      localStorage.setItem('token', token);
      localStorage.setItem('me', JSON.stringify({ id: user.id, email: user.email }));
      navigate('/chat', { replace: true });
    } catch (e: any) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
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

      <div className="flex items-center gap-3">
        <button className="border px-3 py-1" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <Link
          to="/register"
          className="text-sm underline hover:no-underline"
          aria-label="Create an account"
        >
          Create an account
        </Link>
      </div>

      {err && <div className="text-red-600 text-sm">Login failed: {err}</div>}

      <div className="text-xs text-gray-500">
        Tip: set <code>VITE_API_URL</code> (and optionally <code>VITE_SOCKET_URL</code>) to your backend origin,
        e.g. <code>https://anu-chatbot.onrender.com</code>
      </div>
    </form>
  );
}
