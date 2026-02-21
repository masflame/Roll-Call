// @ts-nocheck
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../firebase";

function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[480px] items-center justify-center px-4">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">Lecturer Login</h1>
          <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
            <input
              type="email"
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
            <input
              type="password"
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-brand-primary px-4 py-2 text-text-onBrand transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            No account? <Link to="/register" className="font-semibold text-brand-primary">Register</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

export default Login;
