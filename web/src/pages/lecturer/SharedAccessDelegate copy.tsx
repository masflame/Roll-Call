// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db, functions } from "../../firebase";
import { setDelegateMode } from "../../lib/delegate";
import { doc, getDoc, updateDoc, collection, getDocs, query, where, serverTimestamp, addDoc } from "firebase/firestore";

export default function SharedAccessDelegate() {
  const { accessId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;
  const [access, setAccess] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);

  useEffect(() => {
    if (!accessId) return;
    let mounted = true;
    (async () => {
      try {
        const aRef = doc(db, "moduleAccess", accessId);
        const aSnap = await getDoc(aRef);
        if (!aSnap.exists()) return;
        const a = { id: aSnap.id, ...(aSnap.data() as any) };
        if (!mounted) return;
        setAccess(a);

        // owner info from users collection if present
        if (a.ownerUid) {
          const uQ = await getDocs(query(collection(db, "users"), where("uid", "==", a.ownerUid)));
          if (!uQ.empty) setOwner({ id: uQ.docs[0].id, ...(uQ.docs[0].data() as any) });
        }

        // load module details
        const moduleIds = (a.scope && a.scope.modules) ? (a.scope.modules as string[]) : (a.moduleId ? [a.moduleId] : []);
        const out: any[] = [];
        for (const mId of moduleIds) {
          try {
            const mSnap = await getDoc(doc(db, "modules", mId));
            if (mSnap.exists()) out.push({ id: mSnap.id, ...(mSnap.data() as any) });
          } catch (e) { }
        }
        if (!mounted) return;
        setModules(out);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => { mounted = false; };
  }, [accessId]);

  async function leaveAccess() {
    if (!accessId) return;
    if (!confirm('Leave this shared access?')) return;
    try {
      await updateDoc(doc(db, "moduleAccess", accessId), { status: 'LEFT', lastUsedAt: serverTimestamp() });
      // audit log + notify owner
      try {
        await addDoc(collection(db, "auditLogs"), {
          actorUid: user?.uid || null,
          actorRole: access?.role || null,
          ownerUid: access?.ownerUid || null,
          moduleId: access?.moduleId || null,
          action: 'DELEGATE_LEFT',
          targetId: accessId,
          createdAt: serverTimestamp(),
          meta: {}
        });
        if (access?.ownerUid) {
          await addDoc(collection(db, "notifications"), {
            userId: access.ownerUid,
            sender: 'system',
            type: 'DELEGATE_LEFT',
            message: `${user?.displayName || user?.email || user?.uid} left delegated access`,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) { console.warn('leave audit failed', e); }

      alert('You have left the shared access');
      navigate('/');
    } catch (e) {
      console.error('leave failed', e);
      alert('Failed to leave');
    }
  }

  if (!accessId) return <Layout><div className="p-6">No access specified.</div></Layout>;
  if (!access) return <Layout><div className="p-6">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="rounded-2xl border bg-surface p-6">
        <h2 className="text-xl font-semibold">Shared Access (Delegate Mode)</h2>
        <p className="text-sm text-text-muted mt-2">You are acting as a delegate with role: <strong>{access.role}</strong></p>
        <div className="mt-4">
          <div className="text-sm text-text-muted">Shared by</div>
          <div className="mt-1 text-sm">{owner?.displayName || owner?.email || access.ownerUid}</div>
        </div>

        <div className="mt-4">
          <div className="text-sm text-text-muted">Modules in scope</div>
          <ul className="mt-2 list-disc pl-5">
            {modules.length ? modules.map((m) => <li key={m.id}>{m.moduleCode || m.moduleName || m.id}</li>) : <li className="text-sm text-text-muted">No specific modules (ALL)</li>}
          </ul>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={() => {
            // activate delegate mode and open modules
            setDelegateMode({ accessId: access.id, ownerUid: access.ownerUid || null, role: access.role || null, scope: access.scope || null });
            navigate('/modules');
          }} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">Open Modules</button>
          <button onClick={leaveAccess} className="rounded-full border px-4 py-2 text-sm">Exit shared access</button>
        </div>
      </div>
    </Layout>
  );
}
