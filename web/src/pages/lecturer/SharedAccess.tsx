// @ts-nocheck
import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  updateDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Users,
  UserPlus,
  Mail,
  ShieldCheck,
  CalendarClock,
  Link as LinkIcon,
  X,
  Info as InfoIcon,
} from "lucide-react";
import { ActionSelect } from "../../components/ui/Selects";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

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

function Pill({ children, tone = "neutral" }: any) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        tone === "info"
          ? "border-brand-secondary/25 bg-brand-soft text-brand-secondary"
          : tone === "danger"
          ? "border-accent-error/25 bg-accent-error/5 text-accent-error"
          : tone === "success"
          ? "border-accent-success/25 bg-accent-success/10 text-accent-success"
          : "border-stroke-subtle bg-surfaceAlt text-text-muted"
      )}
    >
      {children}
    </span>
  );
}

function Card({ children }: any) {
  return (
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
      {children}
    </div>
  );
}

function Field({ label, children, hint }: any) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">{label}</div>
        {hint ? <InfoButton text={hint} /> : null}
      </div>
      {children}
    </div>
  );
}

function InfoButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="p-1 rounded-full text-text-muted hover:bg-surfaceAlt"
      >
        <InfoIcon className="h-4 w-4" />
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.14 }}
          className="absolute left-1/2 z-50 -translate-x-1/2 w-64 rounded-lg border border-stroke-subtle bg-surface p-3 text-sm text-text-muted shadow-md"
        >
          {text}
        </motion.div>
      )}
    </div>
  );
}

function Input(props: any) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary",
        props.className
      )}
    />
  );
}

function Select(props: any) {
  return (
    <select
      {...props}
      className={cx(
        "w-full rounded-lg border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary",
        props.className
      )}
    />
  );
}

function Button({ tone = "primary", className, ...props }: any) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
        tone === "primary"
          ? "bg-gray-900 text-white hover:bg-gray-800"
          : tone === "ghost"
          ? "border border-stroke-subtle bg-surface text-text-primary hover:bg-surfaceAlt"
          : tone === "danger"
          ? "border border-accent-error/25 bg-accent-error/5 text-accent-error hover:bg-accent-error/10"
          : "border border-stroke-subtle bg-surfaceAlt text-text-muted hover:bg-surfaceAlt/70",
        className
      )}
    />
  );
}

function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: any;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            className="absolute inset-0 backdrop-blur-md"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ background: 'rgba(0,0,0,0.4)' }}
          />

          <motion.div
            key="modal-card"
            className="relative w-full max-w-lg sm:max-w-2xl rounded-3xl border border-stroke-subtle bg-surface p-6 shadow-subtle"
            initial={{ y: 24, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 12, opacity: 0, scale: 0.985 }}
            transition={{ type: 'spring', stiffness: 650, damping: 40 }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-text-primary">{title}</div>
                {subtitle ? (
                  <div className="mt-1 text-sm text-text-muted">{subtitle}</div>
                ) : null}
              </div>
              <Button tone="ghost" onClick={onClose} className="px-3">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-6">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function SharedAccess() {
  const user = auth.currentUser;
  const navigate = useNavigate();

  const [accessList, setAccessList] = useState<any[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending' | 'expired'>('all');

  // segmented control refs and indicator
  const tabContainerRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; bg: string }>({ left: 0, width: 0, bg: '#000' });

  // Invite form state
  const [openInvite, setOpenInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("TA");
  const [modules, setModules] = useState<string[]>([]);
  const [modulesList, setModulesList] = useState<any[]>([]);
  const [expiry, setExpiry] = useState(90);

  // offerings list for module/offerings/groups selection
  const [offerings, setOfferings] = useState<any[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  const [sending, setSending] = useState(false);

  // Accesses created by me
  useEffect(() => {
    if (!user) return;

    const ref = collection(db, "moduleAccess");
    const q = query(
      ref,
      where("createdByUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );

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

  // Measure segmented control buttons and position indicator
  useLayoutEffect(() => {
    const order = ['all','active','pending','expired'];

    function compute() {
      const idx = order.indexOf(filter);
      const container = tabContainerRef.current;
      const btn = tabButtonRefs.current[idx];
      const bg = (() => {
        switch (filter) {
          case 'active':
            return '#059669';
          case 'pending':
            return '#d97706';
          case 'expired':
            return '#374151';
          default:
            return '#000000';
        }
      })();

      if (container && btn) {
        const cRect = container.getBoundingClientRect();
        const bRect = btn.getBoundingClientRect();
        const left = bRect.left - cRect.left;
        const width = bRect.width;
        setIndicatorStyle({ left, width, bg });
      } else if (container) {
        const w = container.clientWidth / order.length;
        setIndicatorStyle({ left: order.indexOf(filter) * w, width: w, bg });
      }
    }

    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [filter, accessList]);

  // Accesses shared with me
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

  // Load modules owned by current user + offerings for those modules
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
          if (data.lecturerId === user.uid || data.createdByUid === user.uid) {
            mods.push({ id: d.id, ...data });
          }
        });

        mods.sort((a, b) =>
          String(a.moduleCode || a.moduleName || a.id).localeCompare(
            String(b.moduleCode || b.moduleName || b.id)
          )
        );

        if (!mounted) return;
        setModulesList(mods);

        // offerings: batch by 10 for "in" query
        const moduleIds = mods.map((m) => m.id);
        const outOfferings: any[] = [];
        for (let i = 0; i < moduleIds.length; i += 10) {
          const slice = moduleIds.slice(i, i + 10);
          if (slice.length === 0) continue;
          const qq = query(collection(db, "offerings"), where("moduleId", "in", slice));
          const snap = await getDocs(qq);
          snap.forEach((d) => {
            const data = d.data() as any;
            const year = data.year || data.academicYear || "";
            const term = data.term ? ` \u2022 ${data.term}` : "";
            const prog = data.programme ? ` \u2022 ${data.programme}` : "";
            const label = `${year}${term}${prog}`.trim() || (data.title || d.id);
            outOfferings.push({ id: d.id, label, ...data });
          });
        }

        outOfferings.sort((a, b) =>
          String(a.label || a.id).localeCompare(String(b.label || b.id))
        );

        if (!mounted) return;
        setOfferings(outOfferings);
      } catch (e) {
        console.warn("couldn't load modules/offerings", e);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, [user]);

  // Load groups when offering changes
  useEffect(() => {
    if (!selectedOffering) {
      setGroups([]);
      setSelectedGroup(null);
      return;
    }
    let mounted = true;

    (async () => {
      try {
        const q = query(collection(db, "groups"), where("offeringId", "==", selectedOffering));
        const snap = await getDocs(q);
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        arr.sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
        if (!mounted) return;
        setGroups(arr);
      } catch (e) {
        console.warn("failed to load groups", e);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [selectedOffering]);

  // Ensure offering stays compatible with selected modules
  useEffect(() => {
    if (!selectedOffering || modules.length === 0) return;
    const found = offerings.find((o) => String(o.id) === String(selectedOffering));
    if (!found) return;
    if (modules.length > 0 && !modules.includes(String(found.moduleId))) {
      setSelectedOffering(null);
      setSelectedGroup(null);
    }
  }, [modules, selectedOffering, offerings]);

  const myDelegatesActive = useMemo(
    () => accessList.filter((a) => a.status === "ACTIVE").length,
    [accessList]
  );

  const myDelegatesRevoked = useMemo(
    () => accessList.filter((a) => ["REVOKED", "EXPIRED", "LEFT"].includes(a.status)).length,
    [accessList]
  );

  const scopeSummary = useCallback((a: any) => {
    const mods = a?.scope?.modules;
    const offering = a?.scope?.offeringId || a?.offeringId;
    const group = a?.scope?.groupId || a?.groupId;

    const bits: string[] = [];
    if (mods?.length) bits.push(`${mods.length} module(s)`);
    else bits.push("All modules");

    if (offering) bits.push("Offering scoped");
    if (group) bits.push("Group scoped");
    return bits.join(" • ");
  }, []);

  const resetInviteForm = () => {
    setEmail("");
    setRole("TA");
    setModules([]);
    setExpiry(90);
    setSelectedOffering(null);
    setSelectedGroup(null);
  };

  async function sendInvite() {
    if (!user) return;
    if (!email || !role) return alert("Please provide email and role");

    setSending(true);
    try {
      const fn = httpsCallable(functions, "createInvite");

      const payload: any = {
        granteeEmail: email.trim(),
        role,
        moduleIds: modules,
        expiresInDays: expiry,
      };
      if (selectedOffering) payload.offeringId = selectedOffering;
      if (selectedGroup) payload.groupId = selectedGroup;

      const res: any = await fn(payload);
      const data = res?.data || {};

      // Create + copy link if returned
      if (data?.inviteId && data?.token) {
        const link = `${window.location.origin}/accept-invite?inviteId=${data.inviteId}&token=${data.token}`;
        try {
          await navigator.clipboard.writeText(link);
          alert("Invite created and link copied to clipboard");
        } catch {
          alert("Invite created. Share this link: " + link);
        }
      } else if (data?.inviteId) {
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
      resetInviteForm();
    } catch (e) {
      console.error("sendInvite failed", e);
      alert("Failed to send invite");
    } finally {
      setSending(false);
    }
  }

  async function revokeAccess(a: any) {
    if (!a?.id) return;
    if (!confirm("Revoke this access?")) return;

    try {
      await updateDoc(doc(db, "moduleAccess", a.id), { status: "REVOKED" });

      // optional notify grantee
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

  async function copyInviteLink(accessId: string) {
    try {
      const q = query(collection(db, "invites"), where("accessId", "==", accessId));
      const snap = await getDocs(q);
      if (snap.empty) return alert("No invite link found");

      const inv = snap.docs[0];
      const link = `${window.location.origin}/accept-invite?inviteId=${inv.id}`;
      await navigator.clipboard.writeText(link);
      alert("Invite link copied");
    } catch (e) {
      console.error(e);
      alert("Failed to copy link");
    }
  }

  return (
    <Layout>
      <div className="mx-auto w-full max-w-7xl space-y-6">
        {/* Header */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                Shared access
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-text-primary">
                Delegates & Access
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                Invite co-lecturers or TAs with role-based permissions. Scope access by module,
                offering, or group.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill tone="info">
                  <Users className="h-3.5 w-3.5" />
                  {myDelegatesActive} active
                </Pill>
                <Pill>
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {myDelegatesRevoked} revoked
                </Pill>
                <Pill>{sharedWithMe.length} shared with me</Pill>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setOpenInvite(true)}
                className="w-full sm:w-auto inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 transition-colors"
              >
                <UserPlus className="h-4 w-4" />
                Invite Delegate
              </button>
            </div>
          </div>
        </Card>

        {/* Invite modal */}
        <Modal
          open={openInvite}
          title="Invite delegate"
          subtitle="Choose a role and scope. Keep it minimal for enterprise clarity."
          onClose={() => {
            setOpenInvite(false);
          }}
        >
          <div className="grid gap-4">
            <Field label="Email">
              <div className="relative">
                <Mail className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <Input
                  value={email}
                  onChange={(e: any) => setEmail(e.target.value)}
                  placeholder="name@university.ac.za"
                  className="pl-11"
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" hint="TA can create sessions; Read-only can only view.">
                <ActionSelect
                  value={role}
                  onChange={(v: string) => setRole(v)}
                  options={[
                    { label: "Co-lecturer", value: "CO_LECTURER" },
                    { label: "TA (create sessions)", value: "TA" },
                    { label: "Read-only", value: "READ_ONLY" },
                  ]}
                  includeAll={false}
                />
              </Field>

              <Field
                label="Expiry (days)"
                hint="Optional. Default is 90. Use short periods for temporary access."
              >
                <div className="relative">
                  <CalendarClock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                  <Input
                    type="number"
                    min={1}
                    value={expiry}
                    onChange={(e: any) => setExpiry(Number(e.target.value))}
                    className="pl-11"
                  />
                </div>
              </Field>
            </div>

            <Field
              label="Modules"
              hint="Optional. Leave blank for all modules (owner-level decision)."
            >
              <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3">
                {modulesList.length === 0 ? (
                  <div className="text-sm text-text-muted">No modules recorded yet.</div>
                ) : (
                  <div className="grid max-h-44 grid-cols-1 gap-2 overflow-auto sm:grid-cols-2">
                    {modulesList.map((m) => {
                      const checked = modules.includes(m.id);
                      return (
                        <button
                          type="button"
                          key={m.id}
                          onClick={() => {
                            setModules((prev) =>
                              checked ? prev.filter((x) => x !== m.id) : [...prev, m.id]
                            );
                          }}
                          className={cx(
                            "flex items-start justify-between gap-3 rounded-2xl border px-3 py-2 text-left transition",
                            checked
                              ? "border-brand-primary/30 bg-brand-soft"
                              : "border-stroke-subtle bg-surface hover:bg-surfaceAlt"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-text-primary truncate">
                              {m.moduleCode || m.moduleName || m.id}
                            </div>
                            {m.moduleName ? (
                              <div className="text-xs text-text-muted truncate">{m.moduleName}</div>
                            ) : null}
                          </div>
                          <div
                            className={cx(
                              "mt-0.5 h-5 w-9 rounded-full border p-0.5 transition",
                              checked
                                ? "border-brand-primary bg-brand-primary/15"
                                : "border-stroke-subtle bg-surfaceAlt"
                            )}
                          >
                            <div
                              className={cx(
                                "h-4 w-4 rounded-full transition",
                                checked
                                  ? "translate-x-4 bg-brand-primary"
                                  : "translate-x-0 bg-stroke-strong"
                              )}
                            />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Offering (optional)">
                <ActionSelect
                  value={selectedOffering || "all"}
                  onChange={(v: string) => setSelectedOffering(v === "all" ? null : v)}
                  options={offerings
                    .filter((o) => modules.length === 0 || modules.includes(String(o.moduleId)))
                    .map((o) => ({
                      label: o.label || o.id,
                      value: o.id,
                    }))}
                  includeAll
                  allLabel="— none —"
                />
              </Field>

              <Field label="Group (optional)">
                <div className={cx(!selectedOffering && "pointer-events-none opacity-50")}>
                  <ActionSelect
                    value={selectedGroup || "all"}
                    onChange={(v: string) => setSelectedGroup(v === "all" ? null : v)}
                    options={groups.map((g) => ({
                      label: g.label || g.id,
                      value: g.id,
                    }))}
                    includeAll
                    allLabel="— none —"
                  />
                </div>
              </Field>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                tone="ghost"
                onClick={() => {
                  setOpenInvite(false);
                }}
              >
                Cancel
              </Button>
              <Button tone="primary" onClick={sendInvite} disabled={sending}>
                {sending ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </div>
        </Modal>

        {/* Lists */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Delegates I created */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-text-primary">Delegates you created</div>
                <div className="mt-1 text-sm text-text-muted">
                  Manage access and revoke when no longer needed.
                </div>
              </div>
              <Pill>{accessList.length} total</Pill>
            </div>

            {/* Filters: animated segmented control (All / Active / Pending / Expired) */}
            <div className="mt-3">
              <div className="overflow-x-auto -mx-2 px-2">
                <div ref={tabContainerRef} className="relative inline-flex rounded-lg border border-stroke-subtle p-0.5 bg-white w-max">
                  <div
                    aria-hidden
                    className="absolute top-0.5 bottom-0.5 rounded-md shadow-md"
                    style={{
                      left: indicatorStyle.left,
                      width: indicatorStyle.width,
                      transition: 'left 320ms cubic-bezier(.2,.8,.2,1), width 220ms linear, background 200ms linear',
                      background: indicatorStyle.bg,
                      zIndex: 0,
                      willChange: 'left, width'
                    }}
                  />

                  {[
                    { key: 'all', label: `All (${accessList.length})` },
                    { key: 'active', label: `Active (${accessList.filter(a => a.status === 'ACTIVE').length})` },
                    { key: 'pending', label: `Pending (${accessList.filter(a => a.status === 'PENDING').length})` },
                    { key: 'expired', label: `Expired/Revoked (${accessList.filter(a => a.status === 'REVOKED' || a.status === 'EXPIRED' || a.status === 'LEFT').length})` },
                  ].map((b, i) => (
                    <button
                      key={b.key}
                      ref={(el) => (tabButtonRefs.current[i] = el)}
                      onClick={() => setFilter(b.key as any)}
                      className={`relative z-10 flex-initial px-3 py-1.5 text-sm rounded-md transition-colors duration-200 ${
                        filter === b.key ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="text-sm text-text-muted">Loading…</div>
                ) : accessList.filter(a => {
                if (filter === 'all') return true;
                if (filter === 'active') return a.status === 'ACTIVE';
                if (filter === 'pending') return a.status === 'PENDING';
                if (filter === 'expired') return a.status === 'REVOKED' || a.status === 'EXPIRED' || a.status === 'LEFT';
                return true;
              }).length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-6 text-sm text-text-muted">
                  No delegates match this filter.
                </div>
              ) : (
                accessList.filter(a => {
                  if (filter === 'all') return true;
                  if (filter === 'active') return a.status === 'ACTIVE';
                  if (filter === 'pending') return a.status === 'PENDING';
                  if (filter === 'expired') return a.status === 'REVOKED' || a.status === 'EXPIRED' || a.status === 'LEFT';
                  return true;
                }).map((a) => {
                  const revoked = ["REVOKED", "EXPIRED", "LEFT"].includes(a.status);
                  return (
                    <div
                      key={a.id}
                      className={cx(
                        "rounded-2xl border p-4 transition",
                        revoked
                          ? "border-stroke-subtle bg-surfaceAlt"
                          : "border-stroke-subtle bg-surface hover:bg-surfaceAlt"
                      )}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-text-primary truncate">
                              {a.granteeName || a.granteeEmail || a.granteeUid || "Pending"}
                            </div>
                            <Pill tone={revoked ? "danger" : "success"}>
                              {revoked ? "Revoked" : (a.status === 'PENDING' ? 'Pending' : 'Active')}
                            </Pill>
                          </div>
                          <div className="mt-2 text-xs text-text-muted">
                            {roleLabel(a.role)} • {scopeSummary(a)}
                          </div>
                          <div className="mt-1 text-xs text-text-muted">
                            Status: {a.status || "—"}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 sm:justify-end">
                          <Button
                            tone="ghost"
                            onClick={() => navigate(`/settings/shared-access/manage/${a.id}`)}
                          >
                            Open
                          </Button>
                          <Button
                            tone="ghost"
                            onClick={() => copyInviteLink(a.id)}
                            title="Copy invite link"
                          >
                            <LinkIcon className="h-4 w-4" />
                            Copy link
                          </Button>
                          {!revoked ? (
                            <Button tone="danger" onClick={() => revokeAccess(a)}>
                              Revoke
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          {/* Shared with me */}
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-text-primary">Shared with me</div>
                <div className="mt-1 text-sm text-text-muted">
                  Access granted to you by other owners.
                </div>
              </div>
              <Pill>{sharedWithMe.length} total</Pill>
            </div>

            <div className="mt-4 space-y-3">
              {sharedWithMe.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-6 text-sm text-text-muted">
                  No shared accesses.
                </div>
              ) : (
                sharedWithMe.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl border border-stroke-subtle bg-surface p-4 hover:bg-surfaceAlt transition"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text-primary truncate">
                          {a.ownerName || a.ownerEmail || a.ownerUid || "Owner"}
                        </div>
                        <div className="mt-2 text-xs text-text-muted">
                          Role: {roleLabel(a.role)}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          Scope: {scopeSummary(a)}
                        </div>
                      </div>

                      <Button
                        tone="primary"
                        onClick={() => navigate(`/settings/shared-access/delegate/${a.id}`)}
                      >
                        Open
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </Layout>
  );
}