// @ts-nocheck
import { useEffect, useMemo, useState, Fragment } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db } from "../../firebase";
import {
  doc,
  getDoc,
  query,
  collection,
  where,
  getDocs,
  onSnapshot,
  orderBy,
} from "firebase/firestore";
import {
  ArrowLeft,
  Clipboard,
  Shield,
  User2,
  BadgeCheck,
  Clock,
  ScrollText,
  Mail,
  Activity,
  CheckCircle,
  XCircle,
  FileText,
  Search,
} from "lucide-react";
import ActionSelect from "../../components/ui/Selects";
import { motion, AnimatePresence } from "framer-motion";

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

function Card({ children, className }: any) {
  return (
    <div
      className={cx(
        "rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle",
        className
      )}
    >
      {children}
    </div>
  );
}

function Button({ tone = "ghost", className, ...props }: any) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
        tone === "primary"
          ? "bg-brand-primary text-text-onBrand shadow-brand hover:bg-brand-primary/90"
          : "border border-stroke-subtle bg-surface text-text-primary hover:bg-surfaceAlt",
        className
      )}
    />
  );
}

function formatDateMaybe(ts: any) {
  try {
    if (!ts) return "—";
    const d = ts?.toDate ? ts.toDate() : ts instanceof Date ? ts : new Date(ts);
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function getActionIcon(action: string) {
  switch (action) {
    case "DELEGATE_LEFT":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "DELEGATE_JOINED":
      return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "ACCESS_REVOKED":
      return <Shield className="h-4 w-4 text-amber-500" />;
    case "SESSION_STARTED":
      return <Activity className="h-4 w-4 text-blue-500" />;
    default:
      return <FileText className="h-4 w-4 text-gray-500" />;
  }
}

export default function SharedAccessManage() {
  const { accessId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [access, setAccess] = useState<any | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const [copying, setCopying] = useState(false);
  const [auditFilter, setAuditFilter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [loadedMain, setLoadedMain] = useState(false);
  const [auditVisible, setAuditVisible] = useState(true);

  useEffect(() => {
    if (!accessId) return;

    let mounted = true;

    (async () => {
      try {
        setLoadingAccess(true);
        const aRef = doc(db, "moduleAccess", accessId);
        const aSnap = await getDoc(aRef);
        if (!aSnap.exists()) {
          if (mounted) setAccess(null);
          return;
        }
        const a = { id: aSnap.id, ...(aSnap.data() as any) };
        if (!mounted) return;
        setAccess(a);

        // invites (one-off fetch; cheap + simple)
        const qInv = query(collection(db, "invites"), where("accessId", "==", accessId));
        const snap = await getDocs(qInv);
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        arr.sort((x, y) => {
          const xt = x.createdAt?.toDate ? x.createdAt.toDate().getTime() : 0;
          const yt = y.createdAt?.toDate ? y.createdAt.toDate().getTime() : 0;
          return yt - xt;
        });
        if (!mounted) return;
        setInvites(arr);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoadingAccess(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [accessId]);

  // Fade content in when access finished loading
  useEffect(() => {
    if (!loadingAccess) {
      // small delay so transition is visible
      const t = setTimeout(() => setLoadedMain(true), 20);
      return () => clearTimeout(t);
    }
    setLoadedMain(false);
  }, [loadingAccess]);

  // Trigger audit list animation on filter/search/audits change
  useEffect(() => {
    // briefly hide then show to animate
    setAuditVisible(false);
    const raf = requestAnimationFrame(() => {
      const t = setTimeout(() => setAuditVisible(true), 8);
      // cleanup
      return () => clearTimeout(t);
    });
    return () => cancelAnimationFrame(raf);
  }, [auditFilter, searchTerm, audits]);

  // audit logs: owner-wide and access-specific, merged
  useEffect(() => {
    if (!accessId || !user) return;

    const mergeInto = (incoming: any[], source: "owner" | "access") => {
      setAudits((prev) => {
        const map = new Map<string, any>();
        prev.forEach((p) => map.set(p.id, p));
        incoming.forEach((r) => map.set(r.id, { ...r, _source: source }));
        const merged = Array.from(map.values());
        merged.sort((a, b) => {
          const at = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
          const bt = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
          return bt - at;
        });
        return merged;
      });
    };

    const ownerQ = query(
      collection(db, "auditLogs"),
      where("ownerUid", "==", user.uid),
      orderBy("createdAt", "desc")
    );
    const ownerUnsub = onSnapshot(ownerQ, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      mergeInto(arr, "owner");
    });

    const accessQ1 = query(
      collection(db, "auditLogs"),
      where("meta.accessId", "==", accessId),
      orderBy("createdAt", "desc")
    );
    const accessQ2 = query(
      collection(db, "auditLogs"),
      where("targetId", "==", accessId),
      orderBy("createdAt", "desc")
    );

    const accessUnsub1 = onSnapshot(accessQ1, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      mergeInto(arr, "access");
    });
    const accessUnsub2 = onSnapshot(accessQ2, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
      mergeInto(arr, "access");
    });

    return () => {
      ownerUnsub();
      accessUnsub1();
      accessUnsub2();
    };
  }, [accessId, user]);

  const statusTone = useMemo(() => {
    if (!access?.status) return "neutral";
    if (String(access.status).toUpperCase() === "ACTIVE") return "success";
    if (["REVOKED", "LEFT", "EXPIRED"].includes(String(access.status).toUpperCase()))
      return "danger";
    return "neutral";
  }, [access]);

  const scopeLabel = useMemo(() => {
    if (!access) return "—";
    const mods = access?.scope?.modules;
    const offering = access?.scope?.offeringId || access?.offeringId;
    const group = access?.scope?.groupId || access?.groupId;

    const bits: string[] = [];
    if (mods?.length) bits.push(`${mods.length} module(s)`);
    else bits.push("All modules");
    if (offering) bits.push("Offering scoped");
    if (group) bits.push("Group scoped");
    return bits.join(" • ");
  }, [access]);

  const uniqueActions = useMemo(() => {
    const s = new Set<string>();
    audits.forEach((a) => a?.action && s.add(a.action));
    return Array.from(s);
  }, [audits]);

  const filteredAudits = useMemo(() => {
    return audits.filter((log) => {
      if (auditFilter !== "all" && log.action !== auditFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return (
          (log.action || "").toLowerCase().includes(term) ||
          (log.actorUid || "").toLowerCase().includes(term) ||
          JSON.stringify(log.meta || {}).toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [audits, auditFilter, searchTerm]);

  async function copyInviteLink() {
    if (!invites.length) return;
    const invite = invites[0]; // most recent
    const link = `${window.location.origin}/accept-invite?inviteId=${invite.id}`;

    setCopying(true);
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      // fallback prompt
      window.prompt("Copy invite link:", link);
    } finally {
      setCopying(false);
    }
  }

  if (!accessId) {
    return (
      <Layout>
        <motion.div
          className="mx-0 w-full max-w-full px-0 py-6"
          initial={{ opacity: 0, y: -8 }}
          animate={loadedMain ? { opacity: 1, y: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
        >
            <Card>No access specified.</Card>
          </motion.div>
      </Layout>
    );
  }

  if (loadingAccess || !access) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full px-0 py-6">
          <Card>{loadingAccess ? "Loading…" : "Access not found."}</Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* removed horizontal padding so cards span full width */}
      <div className="mx-0 w-full max-w-full space-y-4 px-0 py-6">
        {/* Header */}
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="info">
                  <Shield className="h-3.5 w-3.5" />
                  Shared access
                </Pill>
                <Pill tone={statusTone}>
                  <BadgeCheck className="h-3.5 w-3.5" />
                  {String(access.status || "—")}
                </Pill>
                <Pill>{scopeLabel}</Pill>
              </div>

              <h2 className="mt-3 text-xl font-semibold text-text-primary">
                Manage delegate access
              </h2>
              <p className="mt-2 text-sm text-text-muted break-all">
                Access ID: <span className="font-medium text-text-primary">{access.id}</span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button tone="ghost" onClick={() => navigate(-1)} className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>
          </div>
        </Card>

        {/* Summary grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                  Grantee
                </div>
                <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
                  <User2 className="h-4 w-4 text-text-muted" />
                  <span className="truncate">
                    {access.granteeName || access.granteeEmail || access.granteeUid || "Pending"}
                  </span>
                </div>
                <div className="mt-2 text-xs text-text-muted">
                  Role: <span className="font-medium text-text-primary">{roleLabel(access.role)}</span>
                </div>
                {access.granteeEmail ? (
                  <div className="mt-1 text-xs text-text-muted">
                    <Mail className="inline-block h-3.5 w-3.5 mr-1 align-[-2px]" />
                    {access.granteeEmail}
                  </div>
                ) : null}
              </div>

              <Pill>{roleLabel(access.role)}</Pill>
            </div>
          </Card>

          <Card>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Scope & expiry
            </div>
            <div className="mt-2 text-sm text-text-primary">{scopeLabel}</div>
            <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
              <Clock className="h-4 w-4 text-text-muted" />
              Expires:{" "}
              <span className="font-medium text-text-primary">
                {access.expiresAt?.toDate ? access.expiresAt.toDate().toLocaleString() : "Never"}
              </span>
            </div>
            {access.lastUsedAt && (
              <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                <Activity className="h-4 w-4 text-text-muted" />
                Last used:{" "}
                <span className="font-medium text-text-primary">
                  {access.lastUsedAt?.toDate ? access.lastUsedAt.toDate().toLocaleString() : formatDateMaybe(access.lastUsedAt)}
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* Invites */}
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-text-primary">Invites</div>
              <div className="mt-1 text-sm text-text-muted">
                Latest invite links associated with this access.
              </div>
            </div>

            <Button
              tone="ghost"
              onClick={copyInviteLink}
              disabled={invites.length === 0 || copying}
              className="w-full sm:w-auto"
            >
              <Clipboard className="h-4 w-4" />
              {copying ? "Copying…" : "Copy latest invite link"}
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {invites.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-5 text-sm text-text-muted">
                No invites found for this access.
              </div>
            ) : (
              invites.map((i) => (
                <div
                  key={i.id}
                  className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary truncate">
                        {i.granteeEmail || access.granteeEmail || "Invite"}
                      </div>
                      <div className="mt-1 text-xs text-text-muted break-all">
                        Invite ID: {i.id}
                      </div>
                    </div>
                    <div className="text-xs text-text-muted">
                      Expires: <span className="text-text-primary font-medium">{formatDateMaybe(i.expiresAt)}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Audit logs */}
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-text-primary">Audit logs</div>
              <div className="mt-1 text-sm text-text-muted">Recent activity for this owner and access.</div>

              <div className="mt-3 flex items-center gap-2">
                <div className="w-56">
                  <ActionSelect value={auditFilter} onChange={setAuditFilter} options={uniqueActions} />
                </div>

                <div className="relative flex-1 max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search logs..."
                    className="pl-8 pr-4 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white w-full"
                  />
                </div>
              </div>
            </div>

            <div className="flex-shrink-0">
              <Pill>
                <ScrollText className="h-3.5 w-3.5" />
                {audits.length}
              </Pill>
            </div>
          </div>

          <div className="mt-4 max-h-[22rem] overflow-auto rounded-2xl border border-stroke-subtle">
            <AnimatePresence mode="popLayout">
              {filteredAudits.length === 0 ? (
                <motion.div
                  key="empty"
                  className="p-5 text-sm text-text-muted"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  No audit entries.
                </motion.div>
              ) : (
                <motion.ul layout className="divide-y divide-stroke-subtle">
                  {filteredAudits.map((a) => (
                    <motion.li
                      layout
                      key={a.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.18 }}
                      className="p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="bg-surfaceAlt rounded-lg p-2 mt-1">
                          {getActionIcon(a.action)}
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-2">
                              <div className="text-sm font-semibold text-text-primary">{a.action || "—"}</div>
                              <Pill>{a._source || "log"}</Pill>
                            </div>

                            <div className="text-xs text-text-muted">{formatDateMaybe(a.createdAt)}</div>
                          </div>

                          <div className="mt-1 text-xs text-text-muted break-all">
                            Actor: {a.actorUid || "—"} • Role: {a.actorRole || "—"} • Target: {" "}
                            {a.targetId || a?.meta?.accessId || "—"}
                          </div>

                          {a?.meta && Object.keys(a.meta).length ? (
                            <div className="mt-2 rounded-xl border border-stroke-subtle bg-surfaceAlt p-3 text-xs text-text-muted break-words">
                              {JSON.stringify(a.meta)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </motion.li>
                  ))}
                </motion.ul>
              )}
            </AnimatePresence>
          </div>
        </Card>
      </div>
    </Layout>
  );
}

// `ActionSelect` is provided by components/ui/Selects