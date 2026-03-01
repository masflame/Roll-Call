// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db } from "../../firebase";
import { setDelegateMode } from "../../lib/delegate";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { ArrowRight, LogOut, Shield, User2, BookOpen } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle">
      {children}
    </div>
  );
}

function Button({ tone = "primary", className, ...props }: any) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition",
        tone === "primary"
          ? "bg-brand-primary text-text-onBrand shadow-brand hover:bg-brand-primary/90"
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

export default function SharedAccessDelegate() {
  const { accessId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [access, setAccess] = useState<any>(null);
  const [owner, setOwner] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!accessId) return;

    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const aRef = doc(db, "moduleAccess", accessId);
        const aSnap = await getDoc(aRef);

        if (!aSnap.exists()) {
          if (mounted) {
            setAccess(null);
            setLoading(false);
          }
          return;
        }

        const a = { id: aSnap.id, ...(aSnap.data() as any) };

        if (!mounted) return;
        setAccess(a);

        // owner info (optional)
        if (a.ownerUid) {
          try {
            const uQ = await getDocs(
              query(collection(db, "users"), where("uid", "==", a.ownerUid))
            );
            if (!uQ.empty) {
              const u = { id: uQ.docs[0].id, ...(uQ.docs[0].data() as any) };
              if (mounted) setOwner(u);
            } else {
              if (mounted) setOwner(null);
            }
          } catch (e) {
            if (mounted) setOwner(null);
          }
        }

        // module scope
        const moduleIds: string[] =
          a?.scope?.modules?.length
            ? (a.scope.modules as string[])
            : a?.moduleId
            ? [a.moduleId]
            : [];

        const out: any[] = [];
        for (const mId of moduleIds) {
          try {
            const mSnap = await getDoc(doc(db, "modules", mId));
            if (mSnap.exists()) out.push({ id: mSnap.id, ...(mSnap.data() as any) });
          } catch (_) {}
        }

        if (!mounted) return;
        out.sort((x, y) =>
          String(x.moduleCode || x.moduleName || x.id).localeCompare(
            String(y.moduleCode || y.moduleName || y.id)
          )
        );
        setModules(out);
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [accessId]);

  const ownerLabel = useMemo(() => {
    return owner?.displayName || owner?.email || access?.ownerUid || "—";
  }, [owner, access]);

  const scopeLabel = useMemo(() => {
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

  async function leaveAccess() {
    if (!accessId) return;
    if (!confirm("Leave this shared access?")) return;

    setLeaving(true);
    try {
      await updateDoc(doc(db, "moduleAccess", accessId), {
        status: "LEFT",
        lastUsedAt: serverTimestamp(),
      });

      // audit + notify owner (best effort)
      try {
        await addDoc(collection(db, "auditLogs"), {
          actorUid: user?.uid || null,
          actorRole: access?.role || null,
          ownerUid: access?.ownerUid || null,
          moduleId: access?.moduleId || null,
          action: "DELEGATE_LEFT",
          targetId: accessId,
          createdAt: serverTimestamp(),
          meta: {},
        });

        if (access?.ownerUid) {
          await addDoc(collection(db, "notifications"), {
            userId: access.ownerUid,
            sender: "system",
            type: "DELEGATE_LEFT",
            message: `${user?.displayName || user?.email || user?.uid} left delegated access`,
            read: false,
            createdAt: serverTimestamp(),
          });
        }
      } catch (e) {
        console.warn("leave audit failed", e);
      }

      alert("You have left the shared access");
      navigate("/");
    } catch (e) {
      console.error("leave failed", e);
      alert("Failed to leave");
    } finally {
      setLeaving(false);
    }
  }

  if (!accessId) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full space-y-6 px-0 py-6">
          <Card>No access specified.</Card>
        </div>
      </Layout>
    );
  }

  if (loading || !access) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full space-y-6 px-0 py-6">
          <Card>{loading ? "Loading…" : "Access not found."}</Card>
        </div>
      </Layout>
    );
  }

  const isLeft = access?.status === "LEFT";
  const isRevoked = access?.status === "REVOKED";

  return (
    <Layout>
      {/* reduced horizontal padding to prevent card squeeze */}
      <div className="mx-0 w-full max-w-full space-y-6 px-0 py-6">
        <Card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="info">
                  <Shield className="h-3.5 w-3.5" />
                  Delegate mode
                </Pill>
                <Pill tone={isRevoked || isLeft ? "danger" : "success"}>
                  {isRevoked ? "Revoked" : isLeft ? "Left" : "Active"}
                </Pill>
                <Pill>{scopeLabel}</Pill>
              </div>

              <h2 className="mt-3 text-xl font-semibold text-text-primary">
                Shared Access
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                You are acting as a delegate with role:{" "}
                <span className="font-semibold text-text-primary">{access.role}</span>
              </p>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Shared by
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-text-primary">
                    <User2 className="h-4 w-4 text-text-muted" />
                    <span className="truncate">{ownerLabel}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Modules in scope
                  </div>
                  <div className="mt-2 text-sm text-text-primary">
                    {modules?.length ? `${modules.length} module(s)` : "All modules"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <Button
                tone="primary"
                disabled={isRevoked || isLeft}
                onClick={() => {
                  setDelegateMode({
                    accessId: access.id,
                    ownerUid: access.ownerUid || null,
                    role: access.role || null,
                    scope: access.scope || null,
                  });
                  navigate("/modules");
                }}
                className="w-full sm:w-auto"
              >
                <BookOpen className="h-4 w-4" />
                Open Modules
                <ArrowRight className="h-4 w-4" />
              </Button>

              <Button
                tone="ghost"
                onClick={leaveAccess}
                disabled={leaving || isLeft}
                className="w-full sm:w-auto"
              >
                <LogOut className="h-4 w-4" />
                {leaving ? "Exiting…" : "Exit shared access"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-text-primary">Modules</div>
              <div className="mt-1 text-sm text-text-muted">
                These are the modules available under this access scope.
              </div>
            </div>
            <Pill>{modules?.length || 0}</Pill>
          </div>

          <div className="mt-4">
            {modules?.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {modules.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3"
                  >
                    <div className="text-sm font-semibold text-text-primary">
                      {m.moduleCode || m.moduleName || m.id}
                    </div>
                    {m.moduleName ? (
                      <div className="mt-1 text-xs text-text-muted">{m.moduleName}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-5 text-sm text-text-muted">
                No specific modules listed (this access applies to all modules).
              </div>
            )}
          </div>
        </Card>
      </div>
    </Layout>
  );
}