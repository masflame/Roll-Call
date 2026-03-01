// @ts-nocheck
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth } from "../../firebase";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";

export default function ResetPassword() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode");
  const oobCode = params.get("oobCode");

  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async (e: any) => {
    e.preventDefault();
    setLoading(true); setError(null); setMessage(null);
    try {
      if (!oobCode) throw new Error("Missing code");
      // Optionally verify code (gives email)
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, newPassword);
      setMessage("Password updated. You can now sign in.");
      // notify other tabs that password was updated
      try { localStorage.setItem('password-updated', JSON.stringify({ ts: Date.now() })); } catch (e) {}
      setTimeout(() => navigate('/login'), 1600);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally { setLoading(false); }
  };

  if (mode !== 'resetPassword' || !oobCode) {
    return (
      <Layout>
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <h2 className="text-xl font-semibold mb-3">Reset password</h2>
          <p className="text-sm text-text-muted">Follow the link in your email to reset your password. If you don't have one, request a reset from your account settings.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold mb-2">Choose a new password</h2>
          <form onSubmit={handleReset} className="space-y-3">
            <input type="password" placeholder="New password" className="w-full rounded border px-3 py-2" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            {error && <div className="text-sm text-red-600">{error}</div>}
            {message && <div className="text-sm text-green-700">{message}</div>}
            <div className="flex justify-end">
              <button type="submit" disabled={loading} className="rounded bg-brand-primary px-4 py-2 text-text-onBrand">{loading ? 'Saving…' : 'Set new password'}</button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}

// Auto-confirm flow: if the reset link includes a prefilled new password
// (base64 in query param `prefilledNew` or embedded in continueUrl), attempt
// to confirm immediately and show the success message.
const TryAutoConfirm = () => {
  const location = window.location;
  const params = new URLSearchParams(location.search);
  const pre = params.get('prefilledNew') || (() => {
    const continueUrl = params.get('continueUrl');
    if (!continueUrl) return null;
    try {
      const cu = new URL(continueUrl);
      return cu.searchParams.get('prefilledNew');
    } catch (e) { return null; }
  })();
  if (!pre) return null;
  const decoded = (() => {
    try { return atob(decodeURIComponent(pre)); } catch (e) { return null; }
  })();
  if (!decoded) return null;
  // Defer running confirm so React has mounted the component above and auth is ready
  setTimeout(async () => {
    try {
      const qs = new URLSearchParams(window.location.search);
      const oob = qs.get('oobCode');
      if (!oob) return;
      await verifyPasswordResetCode(auth, oob);
      await confirmPasswordReset(auth, oob, decoded);
      try { localStorage.setItem('password-updated', JSON.stringify({ ts: Date.now() })); } catch (e) {}
      // replace history to remove sensitive query params
      window.history.replaceState({}, document.title, '/reset-password?success=1');
      // show minimal success UI by reloading the page (component will show default message)
      window.location.reload();
    } catch (e) {
      console.error('auto confirm failed', e);
    }
  }, 300);
  return null;
};

// mount the auto confirm helper
TryAutoConfirm();
