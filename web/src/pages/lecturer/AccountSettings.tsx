// @ts-nocheck
import { FormEvent, useState, useEffect } from "react";
import { auth, db } from "../../firebase";
import { reauthenticateWithCredential, EmailAuthProvider, updateEmail, updatePassword, sendEmailVerification } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import Layout from "../../components/ui/Layout";
import { PrimaryButton, Card } from "../../components/ui";
import { useToast } from "../../components/ToastProvider";

export default function AccountSettings() {
  const user = auth.currentUser;
  useEffect(() => {
    try { console.debug('AccountSettings: currentUser', auth.currentUser); console.debug('AccountSettings: providerData', auth.currentUser?.providerData); } catch (e) {}
  }, []);
  const hasPasswordProvider = !!user?.providerData?.some((p: any) => p.providerId === 'password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key !== 'password-updated') return;
      try {
        showToast({ message: 'Password updated successfully.', variant: 'success' });
      } catch (err) {}
      try { localStorage.removeItem('password-updated'); } catch (e) {}
    };
    window.addEventListener('storage', handler);
    // also check on mount (in case same-tab flow set it)
    if (localStorage.getItem('password-updated')) {
      try { showToast({ message: 'Password updated successfully.', variant: 'success' }); } catch (e) {}
      localStorage.removeItem('password-updated');
    }
    return () => window.removeEventListener('storage', handler);
  }, [showToast]);

  // Change password flow: reauthenticate and update password directly.

  const handleChangePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null); setLoading(true);
    const form = e.target as HTMLFormElement;
    const currentPassword = (form.elements.namedItem("currentPassword") as HTMLInputElement).value;
    const newPassword = (form.elements.namedItem("newPassword") as HTMLInputElement).value;
    if (!user?.email) { setError("No email associated with account"); setLoading(false); return; }
    try {
      if (!currentPassword) {
        setError('Please enter your current password to confirm.');
        setLoading(false);
        return;
      }
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      try {
        await reauthenticateWithCredential(user, cred);
      } catch (reauthErr: any) {
        console.error('reauth error', reauthErr && reauthErr.code, reauthErr);
        if (reauthErr?.code === 'auth/wrong-password' || reauthErr?.code === 'auth/invalid-credential') {
          setError('Current password is incorrect.');
        } else if (reauthErr?.code === 'auth/user-mismatch') {
          setError('Reauthentication failed: account mismatch.');
        } else {
          setError(reauthErr?.message || String(reauthErr) || 'Reauthentication failed.');
        }
        setLoading(false);
        return;
      }
      if (!newPassword || newPassword.length <= 6) {
        setError('New password must be longer than 6 characters.');
        setLoading(false);
        return;
      }
      try {
        await updatePassword(user, newPassword);
        setSuccess('Password updated successfully.');
        try { form.reset(); } catch (e) {}
        try { localStorage.setItem('password-updated', JSON.stringify({ ts: Date.now() })); } catch (e) {}
        // create an unread notification for the user so notification panel picks it up
        try {
          // try to fetch IP and approximate location
          const fetchGeo = async () => {
            try {
              const res = await fetch('https://ipapi.co/json/');
              if (!res.ok) throw new Error('geo fetch failed');
              const j = await res.json();
              return {
                ip: j.ip || null,
                city: j.city || null,
                region: j.region || j.region_code || null,
                country: j.country_name || j.country || null,
                latitude: j.latitude || j.lat || null,
                longitude: j.longitude || j.lon || null,
                raw: j
              };
            } catch (e) {
              try {
                const r2 = await fetch('https://api.ipify.org?format=json');
                const j2 = await r2.json();
                return { ip: j2.ip || null };
              } catch (e2) {
                return {};
              }
            }
          };

          const geo = await fetchGeo();
          await addDoc(collection(db, 'notifications'), {
            userId: user.uid,
            type: 'password_update',
            sender: 'system',
            message: 'Your account password was changed successfully.',
            read: false,
            deletable: false,
            meta: {
              ip: geo.ip || null,
              city: geo.city || null,
              region: geo.region || null,
              country: geo.country || null,
              latitude: geo.latitude || null,
              longitude: geo.longitude || null
            },
            createdAt: serverTimestamp()
          });
        } catch (e) {
          console.error('failed to write notification', e);
        }
      } catch (updErr: any) {
        console.error('updatePassword error', updErr && updErr.code, updErr);
        if (updErr?.code === 'auth/weak-password') {
          setError('Password is too weak. Please use a stronger password.');
        } else if (updErr?.code === 'auth/requires-recent-login') {
          setError('For security, please sign out and sign in again before changing your password.');
        } else {
          setError(updErr?.message || String(updErr) || 'Failed to update password.');
        }
      }
    } catch (err: any) { console.error('change password error', err); setError(err?.message || String(err) || 'Failed to change password. Check console for details.'); }
    finally { setLoading(false); }
  };

  const handleChangeEmail = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setSuccess(null); setLoading(true);
    const form = e.target as HTMLFormElement;
    const currentPassword = (form.elements.namedItem("curPwd") as HTMLInputElement).value;
    const newEmail = (form.elements.namedItem("newEmail") as HTMLInputElement).value;
    if (!user?.email) { setError("No email associated with account"); setLoading(false); return; }
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updateEmail(user, newEmail);
      // send verification to the new email
      try {
        const actionCodeSettings = { url: `${window.location.origin}/login` } as any;
        await sendEmailVerification(user, actionCodeSettings);
      } catch (e) {
        // best-effort: still consider update successful
      }
      setSuccess(`Email updated. Verification sent to ${newEmail}`);
    } catch (err: any) { console.error('change email error', err); setError(err?.message || String(err) || 'Failed to change email. Check console for details.'); }
    finally { setLoading(false); }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight text-brand-primary mb-2">Account settings</h1>
        <Card className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-1">Change password</h3>
            <p className="text-base text-gray-500">Change your password (requires current password).</p>
          </div>
          <div className="space-y-4">
            {hasPasswordProvider ? (
              <form onSubmit={handleChangePassword} className="grid gap-4">
                <input name="currentPassword" type="password" placeholder="Current password" className="w-full rounded-full border border-gray-200 px-5 py-3 text-base text-gray-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 placeholder:text-gray-400" required />
                <input name="newPassword" type="password" placeholder="New password" className="w-full rounded-full border border-gray-200 px-5 py-3 text-base text-gray-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 placeholder:text-gray-400" required />
                <PrimaryButton type="submit" disabled={loading}>{loading ? 'Saving...' : 'Update password'}</PrimaryButton>
              </form>
            ) : (
              <div className="text-base text-gray-400">
                Your account does not support password-based reauthentication. Reauthenticate using your provider or set a password via the sign-in flow before changing password here.
              </div>
            )}
          </div>
        </Card>

        <Card className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-1">Change email</h3>
            <p className="text-base text-gray-500">To change your account email provide your current password. A verification email will be sent to the new address.</p>
          </div>
          {hasPasswordProvider ? (
            <form onSubmit={handleChangeEmail} className="grid gap-4">
              <input name="curPwd" type="password" placeholder="Current password" className="w-full rounded-full border border-gray-200 px-5 py-3 text-base text-gray-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 placeholder:text-gray-400" required />
              <input name="newEmail" type="email" placeholder="New email address" className="w-full rounded-full border border-gray-200 px-5 py-3 text-base text-gray-900 focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 placeholder:text-gray-400" required />
              <PrimaryButton type="submit" disabled={loading}>{loading ? 'Saving...' : 'Update email'}</PrimaryButton>
            </form>
          ) : (
            <div className="text-base text-gray-400">Your account doesn't support password-based reauthentication. Reauthenticate by signing in with your email link or set a password using the reset email, then try changing email.</div>
          )}
        </Card>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700 font-medium">{error}</div>}
        {success && <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-base text-green-700 font-medium">{success}</div>}
      </div>
    </Layout>
  );
}
