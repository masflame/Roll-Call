// @ts-nocheck
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const inviteId = params.get("inviteId");
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<any>(null);
  const [access, setAccess] = useState<any>(null);
  const user = auth.currentUser;
  const navigate = useNavigate();

  useEffect(() => {
    if (!inviteId) return setLoading(false);
    const load = async () => {
      try {
        const invRef = doc(db, "invites", inviteId);
        const invSnap = await getDoc(invRef);
        if (!invSnap.exists()) {
          setInvite(null);
          setLoading(false);
          return;
        }
        const inv = { id: invSnap.id, ...invSnap.data() };
        setInvite(inv);
        const accessRef = doc(db, "moduleAccess", inv.accessId);
        const aSnap = await getDoc(accessRef);
        if (aSnap.exists()) setAccess({ id: aSnap.id, ...aSnap.data() });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [inviteId]);

  const token = params.get("token");

  async function accept() {
    if (!user) {
      // prompt sign in
      alert("Please sign in to accept the invite");
      navigate('/login');
      return;
    }

    if (!invite || !access) return;
    try {
      // call server function to accept invite securely
      const fn = httpsCallable(functions, "acceptInvite");
      const res = await fn({ inviteId, token });
      if (res?.data?.success) {
        const accessId = res.data.accessId;
        alert('Invite accepted — you now have delegated access');
        if (accessId) navigate(`/settings/shared-access/delegate/${accessId}`);
        else navigate('/modules');
      } else {
        alert('Failed to accept invite');
      }
    } catch (e) {
      console.error('accept failed', e);
      alert('Failed to accept invite');
    }
  }

  if (!inviteId) return (
    <Layout><div className="p-6">No invite specified.</div></Layout>
  );

  if (loading) return (<Layout><div className="p-6">Loading…</div></Layout>);

  if (!invite || !access) return (<Layout><div className="p-6">Invite not found or expired.</div></Layout>);

  return (
    <Layout>
      <div className="rounded-2xl border bg-surface p-6">
        <h2 className="text-lg font-semibold">You're invited</h2>
        <p className="text-sm text-text-muted mt-2">{access.createdByUid || 'A lecturer'} invited you to access their modules as: <strong>{access.role}</strong></p>
        <div className="mt-4">
          <div className="text-sm text-text-muted">Scope:</div>
          <div className="mt-1 text-sm">{access.scope?.modules ? `${(access.scope.modules || []).length} module(s)` : 'All modules'}</div>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={accept} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">Accept</button>
          <button onClick={() => navigate('/')} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
        </div>
      </div>
    </Layout>
  );
}
