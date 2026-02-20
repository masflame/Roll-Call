// @ts-nocheck
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";

function Register() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const displayName = `${firstName} ${lastName}`.trim();
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName });
      }
      await setDoc(doc(db, "lecturers", credential.user.uid), {
        firstName,
        lastName,
        displayName,
        email,
        department,
        createdAt: serverTimestamp()
      });
      navigate("/");
    } catch (err: any) {
      const errorCode = err?.code || "unknown";
      const errorMessage = err?.message || "Registration failed";
      // Log rich error details for easier debugging while developing.
      console.error("Registration error", { errorCode, errorMessage, raw: err });
      setError(`${errorCode}: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[480px] items-center justify-center px-4">
        <div className="w-full max-w-xl rounded-lg bg-white p-8 shadow">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">Lecturer Registration</h1>
          <form className="grid grid-cols-1 gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">First name</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Last name</label>
              <input
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </div>
          </div>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Department (optional)</label>
            <input
              className="w-full rounded border border-slate-300 px-3 py-2"
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Confirm password</label>
              <input
                type="password"
                className="w-full rounded border border-slate-300 px-3 py-2"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            className="rounded bg-primary-500 px-4 py-2 text-white transition hover:bg-primary-600 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
          </form>
          <p className="mt-4 text-sm text-slate-600">
            Already registered? <Link to="/login" className="font-semibold text-primary-600">Sign in</Link>
          </p>
        </div>
      </div>
    </Layout>
  );
}

export default Register;
