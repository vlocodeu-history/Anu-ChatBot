import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login as apiLogin } from "@/services/api";

type Props = {
  onSuccess?: (user: { id: string; email: string }, token: string) => void;
};

export default function LoginPage({ onSuccess }: Props) {
  const [email, setEmail] = useState("alice@test.com");
  const [password, setPassword] = useState("Passw0rd!");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      // ✅ send JSON object { email, password }
      const { token, user } = await apiLogin({ email: email.trim(), password });
      localStorage.setItem("token", token);
      localStorage.setItem("me", JSON.stringify({ id: user.id, email: user.email }));
      onSuccess ? onSuccess(user, token) : navigate("/chat", { replace: true });
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
    <div className="min-h-screen flex items-center justify-center bg-chat-bg">
      <div className="w-[380px] bg-white rounded-xl shadow-md border border-black/5 p-6">
        <h1 className="text-xl font-semibold mb-4 text-gray-800">Welcome back</h1>

        <form onSubmit={submit} className="space-y-3">
          <input
            id="email"
            name="email"
            type="email"
            className="w-full border border-black/10 rounded px-3 py-2 outline-none focus:ring focus:ring-brand-200"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="alice@test.com"
            autoComplete="username"
            required
          />

          <input
            id="password"
            name="password"
            type="password"
            className="w-full border border-black/10 rounded px-3 py-2 outline-none focus:ring focus:ring-brand-200"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="password"
            autoComplete="current-password"
            required
          />

          <button
            type="submit"
            className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-2 transition disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {err && <div className="mt-3 text-red-600 text-sm">Login failed: {err}</div>}

        <div className="mt-4 text-sm text-gray-600">
          New here?{" "}
          <Link className="text-brand-600 hover:underline" to="/register">
            Create an account
          </Link>
        </div>

        <div className="mt-3 text-[11px] text-gray-500">
          Tip: set <code>VITE_API_URL</code> (and optionally{" "}
          <code>VITE_SOCKET_URL</code>) to your backend origin, e.g.{" "}
          <code>https://anu-chatbot.onrender.com</code>
        </div>
      </div>
    </div>
  );
}
