// @ts-nocheck
import { useEffect, useState } from "react";
import Layout from "../../components/ui/Layout";
import { auth, db, functions } from "../../firebase";
import { httpsCallable } from "firebase/functions";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDocs,
  getDoc,
  updateDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

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

export default function SharedAccess() {
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [accessList, setAccessList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite form state
  const [openInvite, setOpenInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TA");
  const [modules, setModules] = useState<string[]>([]);
  const [modulesList, setModulesList] = useState<any[]>([]);
  const [expiry, setExpiry] = useState(90); // days

  // offerings list for module/offerings/groups selection
  const [offerings, setOfferings] = useState<any[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "moduleAccess");
    const q = query(ref, where("createdByUid", "==", user.uid), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setAccessList(arr);
        setLoading(false);
      },
      (err) => {
        console.error("moduleAccess listener", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  // load accesses shared with me
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "moduleAccess"), where("granteeUid", "==", user.uid));
    const unsub = onSnapshot(q, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setSharedWithMe(arr);
    });
    return () => unsub();
  }, [user]);
  // load modules owned by current user + offerings for those modules
  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const load = async () => {
      try {
        const mRef = collection(db, "modules");
        const mSnap = await getDocs(query(mRef));
        const mods: any[] = [];
        mSnap.forEach((d) => {
          const data = d.data() as any;
          if (data.lecturerId === user.uid || data.createdByUid === user.uid) mods.push({ id: d.id, ...data });
        });
        if (!mounted) return;
        setModulesList(mods);

        // fetch offerings for these modules (batch in 10s to use `in` query)
        const moduleIds = mods.map((m) => m.id);
        const outOfferings: any[] = [];
        for (let i = 0; i < moduleIds.length; i += 10) {
          const slice = moduleIds.slice(i, i + 10);
          if (slice.length === 0) continue;
          const q = query(collection(db, "offerings"), where("moduleId", "in", slice));
          const snap = await getDocs(q);
          snap.forEach((d) => outOfferings.push({ id: d.id, ...d.data() }));
        }
        if (!mounted) return;
        setOfferings(outOfferings);
      } catch (e) {
        console.warn("couldn't load modules/offerings", e);
      }
    };
    load();
    return () => { mounted = false; };
  }, [user]);

  // load groups when an offering is selected
  useEffect(() => {
    if (!selectedOffering) { setGroups([]); setSelectedGroup(null); return; }
    let mounted = true;
    (async () => {
      try {
        const q = query(collection(db, "groups"), where("offeringId", "==", selectedOffering));
        const snap = await getDocs(q);
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        if (!mounted) return;
        setGroups(arr);
      } catch (e) {
        console.warn("failed to load groups", e);
      }
    })();
    return () => { mounted = false; };
  }, [selectedOffering]);

  async function sendInvite() {
    if (!user) return;
    if (!email || !role) return alert("Please provide email and role");

    try {
        const fn = httpsCallable(functions, "createInvite");
        const payload: any = { granteeEmail: email, role, moduleIds: modules, expiresInDays: expiry };
        if (selectedOffering) payload.offeringId = selectedOffering;
        if (selectedGroup) payload.groupId = selectedGroup;
        const res = await fn(payload);
      const data = res.data || {};
      // server will email the invite; if it returns a token we can copy link
      if (data && data.inviteId && data.token) {
        const link = `${window.location.origin}/accept-invite?inviteId=${data.inviteId}&token=${data.token}`;
        try {
          await navigator.clipboard.writeText(link);
          alert("Invite created and link copied to clipboard");
        } catch {
          alert("Invite created. Share this link: " + link);
        }
      } else if (data && data.inviteId) {
        const link = `${window.location.origin}/accept-invite?inviteId=${data.inviteId}`;
        try {
          await navigator.clipboard.writeText(link);
          alert("Invite created and link copied to clipboard");
        } catch {
          alert("Invite created. Share this link: " + link);
        }
      } else {
        alert("Invite created");
      }

      setOpenInvite(false);
      setEmail("");
      setModules([]);
      setSelectedOffering(null);
      setSelectedGroup(null);
    } catch (e) {
      console.error("sendInvite failed", e);
      alert("Failed to send invite");
    }
  }

  // ensure offering selection is valid for selected modules
  useEffect(() => {
    if (!selectedOffering || modules.length === 0) return;
    const found = offerings.find((o) => String(o.id) === String(selectedOffering));
    if (!found) return;
    if (modules.length > 0 && !modules.includes(String(found.moduleId))) {
      setSelectedOffering(null);
      setSelectedGroup(null);
    }
  }, [modules, selectedOffering, offerings]);

  async function revokeAccess(a: any) {
    if (!a?.id) return;
    if (!confirm("Revoke this access?")) return;
    try {
      await updateDoc(doc(db, "moduleAccess", a.id), { status: "REVOKED" });
      // optional: create notification to grantee
      if (a.granteeUid) {
        await addDoc(collection(db, "notifications"), {
          userId: a.granteeUid,
          sender: "system",
          type: "ACCESS_REVOKED",
          message: `Access revoked for ${a.granteeEmail || a.granteeUid}`,
          read: false,
          createdAt: serverTimestamp(),
        });
      }
    } catch (e) {
      console.error("revoke failed", e);
      alert("Failed to revoke");
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">Shared access</p>
              <h1 className="mt-2 text-2xl font-semibold text-text-primary">Delegates & Access</h1>
              <p className="mt-2 text-sm text-text-muted">Invite colleagues or TAs to manage sessions with limited privileges.</p>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setOpenInvite(true)} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">Invite</button>
            </div>
          </div>
        </div>

        {openInvite && (
          <div className="rounded-2xl border border-stroke-subtle bg-surface p-4">
            <div className="grid gap-3">
              <label className="text-sm text-text-muted">Email</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-md border px-3 py-2" />

              <label className="text-sm text-text-muted">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border px-3 py-2">
                <option value="CO_LECTURER">Co-lecturer</option>
                <option value="TA">TA (create sessions)</option>
                <option value="READ_ONLY">Read-only</option>
              </select>

              <label className="text-sm text-text-muted">Modules (optional)</label>
              <div className="grid gap-2">
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto">
                  {modulesList.length === 0 ? (
                    <div className="text-sm text-text-muted">No modules recorded yet</div>
                  ) : (
                    modulesList.map((m) => (
                      <label key={m.id} className="inline-flex items-center gap-2">
                        <input type="checkbox" checked={modules.includes(m.id)} onChange={(e) => {
                          if (e.target.checked) setModules((s) => [...s, m.id]);
                          else setModules((s) => s.filter((x) => x !== m.id));
                        }} />
                        <span className="text-sm">{m.moduleCode || m.moduleName || m.id}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              <label className="text-sm text-text-muted">Offering (optional)</label>
              <select value={selectedOffering || ""} onChange={(e) => setSelectedOffering(e.target.value || null)} className="rounded-md border px-3 py-2">
                <option value="">— none —</option>
                {offerings
                  .filter((o) => modules.length === 0 || modules.includes(String(o.moduleId)))
                  .map((o) => (
                    <option key={o.id} value={o.id}>{o.title || o.label || `${o.moduleId} • ${o.id}`}</option>
                  ))}
              </select>

              <label className="text-sm text-text-muted">Group (optional)</label>
              <select value={selectedGroup || ""} onChange={(e) => setSelectedGroup(e.target.value || null)} className="rounded-md border px-3 py-2">
                <option value="">— none —</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.label || g.id}</option>
                ))}
              </select>

              <label className="text-sm text-text-muted">Expiry (days, optional — default 90)</label>
              <input type="number" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))} className="rounded-md border px-3 py-2 w-40" />

              <div className="flex gap-2">
                <button onClick={sendInvite} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">Send invite</button>
                <button onClick={() => setOpenInvite(false)} className="rounded-full border px-4 py-2 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {loading ? <div>Loading…</div> : (
            <>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Delegates you created</h3>
                {accessList.length === 0 ? <div className="text-sm text-text-muted">No delegates yet.</div> : accessList.map((a) => (
                  <div key={a.id} className="rounded-2xl border bg-surface p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{a.granteeName || a.granteeEmail || a.granteeUid || 'Pending'}</div>
                      <div className="text-xs text-text-muted">{roleLabel(a.role)} • {a.scope?.modules ? `${(a.scope.modules || []).length} module(s)` : 'All modules'}</div>
                      <div className="text-xs text-text-muted">Status: {a.status}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => revokeAccess(a)} className="rounded-full border px-3 py-1 text-sm">Revoke</button>
                      <button onClick={() => navigate(`/settings/shared-access/manage/${a.id}`)} className="rounded-full border px-3 py-1 text-sm">Open</button>
                      <button onClick={() => {
                        (async () => {
                          try {
                            const q = query(collection(db, "invites"), where("accessId", "==", a.id));
                            const snap = await getDocs(q);
                            if (!snap.empty) {
                              const inv = snap.docs[0];
                              const link = `${window.location.origin}/accept-invite?inviteId=${inv.id}`;
                              await navigator.clipboard.writeText(link);
                              alert('Invite link copied');
                            } else alert('No invite link found');
                          } catch (e) { console.error(e); alert('Failed to copy link'); }
                        })();
                      }} className="rounded-full border px-3 py-1 text-sm">Copy invite link</button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <h3 className="text-sm font-semibold">Shared with me</h3>
                {sharedWithMe.length === 0 ? <div className="text-sm text-text-muted">No shared accesses</div> : sharedWithMe.map((a) => (
                  <div key={a.id} className="rounded-2xl border bg-surface p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{a.granteeName || a.granteeEmail || a.granteeUid}</div>
                      <div className="text-xs text-text-muted">Shared by: {a.ownerUid}</div>
                      <div className="text-xs text-text-muted">Role: {roleLabel(a.role)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => navigate(`/settings/shared-access/delegate/${a.id}`)} className="rounded-full bg-brand-primary px-3 py-1 text-sm font-semibold text-text-onBrand">Open</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
