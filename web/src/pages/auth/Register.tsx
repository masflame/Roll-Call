// @ts-nocheck
import { FormEvent, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { createUserWithEmailAndPassword, updateProfile, onAuthStateChanged } from "firebase/auth";
import { doc, serverTimestamp, setDoc, collection, query, where, getDocs, deleteDoc } from "firebase/firestore";
import { auth, db } from "../../firebase";
import { supabase } from "../../lib/supabaseClient";

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
  const [detailedError, setDetailedError] = useState<string | null>(null);

  const [otpSent, setOtpSent] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [registered, setRegistered] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      // store password locally temporarily so we can create Firebase user after magic link
      try { localStorage.setItem(`pendingPasswordFor:${email}`, password); } catch {}
      // ask Supabase to send a magic link to this email
      const redirect = `${window.location.origin}/complete-signup?email=${encodeURIComponent(email)}`;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } } as any);
      if (error) {
        throw error;
      }
      // store pending registration in Firestore to complete after OTP verification
      await setDoc(doc(db, "pendingRegistrations", email), {
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        email,
        department,
        passwordPlaceholder: true,
        createdAt: serverTimestamp()
      });
      setOtpSent(true);
      setDetailedError(null);
    } catch (err: any) {
      const errorObj = { name: err?.name || null, code: err?.code || null, message: err?.message || String(err), stack: err?.stack || null, timestamp: new Date().toISOString() };
      console.error("supabase.signInWithOtp failed", err, errorObj);
      setDetailedError(JSON.stringify(errorObj, null, 2));
      setError("Failed to send verification code — see details below.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: FormEvent) => {
    e.preventDefault();
    setVerifyingOtp(true);
    setError(null);
    try {
      // verify OTP via Supabase
      const { error, data } = await supabase.auth.verifyOtp({ email, token: otpCode, type: 'email' } as any);
      if (error) throw error;
      // now create Firebase account with provided password
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (cred && auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: `${firstName} ${lastName}`.trim() });
      }
      // mark pending registration completed and redirect to centralized finalizer
      try { await setDoc(doc(db, "pendingRegistrations", email), { completed: true }, { merge: true }); } catch {}
      try { await supabase.auth.signOut(); } catch {}
      // navigate to centralized finalizer which will create the lecturer doc without duplication
      navigate(`/complete-signup?email=${encodeURIComponent(email)}`);
    } catch (err: any) {
      const errorObj = { name: err?.name || null, code: err?.code || null, message: err?.message || String(err), stack: err?.stack || null, timestamp: new Date().toISOString() };
      console.error("verifyOtp/createUser failed", err, errorObj);
      setDetailedError(JSON.stringify(errorObj, null, 2));
      setError("Failed to verify code or create account — see details below.");
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleResend = async () => {
    setError(null);
    setLoading(true);
    try {
      const redirect = `${window.location.origin}/complete-signup?email=${encodeURIComponent(email)}`;
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } } as any);
      if (error) throw error;
      setResentAt(Date.now());
    } catch (err: any) {
      console.error('resend failed', err);
      setError('Failed to resend confirmation link.');
    } finally {
      setLoading(false);
    }
  };

  // detect Firebase sign-in (e.g. user clicked magic-link in another tab/device)
  useEffect(() => {
    const un = onAuthStateChanged(auth, (user) => {
      try {
        if (user && otpSent && email && user.email === email) {
          setRegistered(true);
        }
      } catch (e) {
        // ignore
      }
    });
    return () => un();
  }, [email, otpSent]);

  return (
    <Layout>
      <div className="flex min-h-screen items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl rounded-lg bg-white p-8 shadow">
          <h1 className="mb-6 text-2xl font-bold text-slate-900">Lecturer Registration</h1>
          {registered ? (
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-green-600">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Successfully registered</h2>
              <p className="text-sm text-slate-600 mb-0">You can close this tab.</p>
            </div>
          ) : otpSent ? (
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-green-600">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-slate-900 mb-2">Check your email</h2>
              <p className="text-sm text-slate-600 mb-4">We sent a confirmation link to <span className="font-medium text-slate-800">{email}</span>. Click the link to complete registration.</p>
              <div className="flex justify-center gap-3">
                <button onClick={handleResend} className="rounded-md border px-4 py-2 text-sm bg-white hover:bg-slate-50" disabled={loading}>
                  {loading ? 'Resending…' : 'Resend link'}
                </button>
                <Link to="/login" className="rounded-md bg-brand-primary px-4 py-2 text-sm text-text-onBrand">Back to sign in</Link>
              </div>
              {resentAt && <p className="mt-3 text-xs text-slate-500">Link resent at {new Date(resentAt).toLocaleTimeString()}</p>}
            </div>
          ) : (
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
          {detailedError && (
            <pre className="mt-3 max-h-40 overflow-auto rounded border bg-gray-50 p-3 text-xs text-red-700">{detailedError}</pre>
          )}
          <button
            type="submit"
            className="w-full rounded bg-brand-primary px-4 py-2 text-text-onBrand transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-slate-400"
            disabled={loading}
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
          </form>
          )}
          {!otpSent && (
            <p className="mt-4 text-sm text-slate-600">
              Already registered? <Link to="/login" className="font-semibold text-brand-primary">Sign in</Link>
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default Register;
