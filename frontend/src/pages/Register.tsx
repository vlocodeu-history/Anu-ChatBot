import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register as apiRegister } from '@/services/api';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('Passw0rd!');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { token, user } = await apiRegister({ email, password });
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
      <h1 className="text-xl font-semibold">Create account</h1>

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
        autoComplete="new-password"
      />

      <button className="border px-3 py-1" disabled={loading}>
        {loading ? 'Creating…' : 'Register'}
      </button>

      {err && <div className="text-red-600 text-sm">Registration failed: {err}</div>}

      <div className="text-xs text-gray-500">
        Already have an account?{' '}
        <Link to="/login" className="underline">Sign in</Link>
      </div>
    </form>
  );
}
