// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db } from "../../firebase";
import { doc, getDoc, query, collection, where, getDocs, onSnapshot, orderBy } from "firebase/firestore";

function roleLabel(r: string) {
  switch (r) {
    case "CO_LECTURER":
      return "Co-lecturer";
    case "TA":
      return "TA";
    case "READ_ONLY":
      return "Read-only";
    default:
      return r;
  }
}

export default function SharedAccessManage() {
  const { accessId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [access, setAccess] = useState<any | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);

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

        // invites
        const q = query(collection(db, "invites"), where("accessId", "==", accessId));
        const snap = await getDocs(q);
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        setInvites(arr);
      } catch (e) {
        console.error(e);
      }
    })();

    return () => { mounted = false; };
  }, [accessId]);

  // audit logs: owner-wide and access-specific
  useEffect(() => {
    if (!accessId || !user) return;

    // owner-wide
    const ownerQ = query(collection(db, "auditLogs"), where("ownerUid", "==", user.uid), orderBy("createdAt", "desc"));
    const ownerUnsub = onSnapshot(ownerQ, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setAudits((prev) => {
        const map = new Map<string, any>();
        prev.forEach((p) => map.set(p.id, p));
        arr.forEach((r) => map.set(r.id, { ...r, _source: 'owner' }));
        const merged = Array.from(map.values());
        merged.sort((a,b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
        return merged;
      });
    });

    // access-specific (meta.accessId or targetId)
    const accessQ1 = query(collection(db, "auditLogs"), where("meta.accessId", "==", accessId), orderBy("createdAt", "desc"));
    const accessQ2 = query(collection(db, "auditLogs"), where("targetId", "==", accessId), orderBy("createdAt", "desc"));
    const accessUnsub1 = onSnapshot(accessQ1, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setAudits((prev) => {
        const map = new Map<string, any>();
        prev.forEach((p) => map.set(p.id, p));
        arr.forEach((r) => map.set(r.id, { ...r, _source: 'access' }));
        const merged = Array.from(map.values());
        merged.sort((a,b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
        return merged;
      });
    });
    const accessUnsub2 = onSnapshot(accessQ2, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      setAudits((prev) => {
        const map = new Map<string, any>();
        prev.forEach((p) => map.set(p.id, p));
        arr.forEach((r) => map.set(r.id, { ...r, _source: 'access' }));
        const merged = Array.from(map.values());
        merged.sort((a,b) => (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0) - (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0));
        return merged;
      });
    });

    return () => { ownerUnsub(); accessUnsub1(); accessUnsub2(); };
  }, [accessId, user]);

  if (!accessId) return <Layout><div className="p-6">No access specified.</div></Layout>;
  if (!access) return <Layout><div className="p-6">Loading…</div></Layout>;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-2xl border bg-surface p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-semibold">Shared Access — Manage</h2>
              <p className="text-sm text-text-muted mt-1">Access ID: {access.id}</p>
            </div>
            <div>
              <button onClick={() => navigate(-1)} className="rounded-full border px-3 py-1">Back</button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-6">
            <div>
              <div className="text-sm text-text-muted">Grantee</div>
              <div className="mt-1 font-semibold">{access.granteeName || access.granteeEmail || access.granteeUid || 'Pending'}</div>
              <div className="text-xs text-text-muted">Role: {roleLabel(access.role)}</div>
              <div className="text-xs text-text-muted mt-2">Status: {access.status}</div>
            </div>
            <div>
              <div className="text-sm text-text-muted">Scope</div>
              <div className="mt-1 text-sm">{access.scope?.modules ? `${(access.scope.modules || []).length} module(s)` : 'All modules'}</div>
              <div className="text-xs text-text-muted mt-2">Expires: {access.expiresAt?.toDate ? access.expiresAt.toDate().toLocaleString() : 'Never'}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border bg-surface p-6">
          <h3 className="text-sm font-semibold">Invites</h3>
          <div className="mt-3">
            {invites.length === 0 ? <div className="text-sm text-text-muted">No invites</div> : invites.map((i) => (
              <div key={i.id} className="p-3 border rounded-md mb-2">
                <div className="text-sm font-semibold">{i.granteeEmail}</div>
                <div className="text-xs text-text-muted">Expires: {i.expiresAt?.toDate ? i.expiresAt.toDate().toLocaleString() : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border bg-surface p-6">
          <h3 className="text-sm font-semibold">Audit logs</h3>
          <div className="mt-3 max-h-72 overflow-auto">
            {audits.length === 0 ? <div className="text-sm text-text-muted">No audit entries</div> : audits.map((a) => (
              <div key={a.id} className="p-3 border-b">
                <div className="text-sm font-semibold">{a.action}</div>
                <div className="text-xs text-text-muted">Actor: {a.actorUid} • Role: {a.actorRole || '—'} • Target: {a.targetId || (a.meta && a.meta.accessId) || '—'}</div>
                <div className="mt-1 text-xs">{JSON.stringify(a.meta || {})}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
