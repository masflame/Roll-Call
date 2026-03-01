// @ts-nocheck
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Layout from "../../components/ui/Layout";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import { Bell, Check, CheckCheck } from "lucide-react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatWhen(ts: any) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d || Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function Pill({ children, tone = "neutral" }: any) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        tone === "info"
          ? "border-brand-secondary/25 bg-brand-soft text-brand-secondary"
          : tone === "success"
          ? "border-accent-success/25 bg-accent-success/10 text-accent-success"
          : "border-stroke-subtle bg-surfaceAlt text-text-muted"
      )}
    >
      {children}
    </span>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-10 text-center">
      <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-stroke-subtle bg-surface">
        <Bell className="h-5 w-5 text-text-muted" />
      </div>
      <div className="mt-4 text-sm font-semibold text-text-primary">No notifications</div>
      <div className="mt-1 text-sm text-text-muted">
        You’re all caught up — new alerts will appear here.
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div className="w-full">
          <div className="h-3 w-24 rounded bg-surfaceAlt" />
          <div className="mt-3 h-4 w-3/4 rounded bg-surfaceAlt" />
          <div className="mt-2 h-4 w-2/3 rounded bg-surfaceAlt" />
        </div>
        <div className="h-9 w-24 rounded-full bg-surfaceAlt" />
      </div>
    </div>
  );
}

export default function Notifications() {
  const user = auth.currentUser;

  const [notes, setNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const notRef = collection(db, "notifications");
    const q = query(
      notRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setNotes(arr);
        setLoading(false);
      },
      (err) => {
        console.error("notifications listener error", err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user]);

  const unreadCount = useMemo(() => notes.filter((n) => !n.read).length, [notes]);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const [maxH, setMaxH] = useState('0px');

    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (open) {
        // measure scrollHeight to animate to exact height
        const h = el.scrollHeight;
        // set to measured px to animate
        setMaxH(h + 'px');
        // after animation, remove max-height to allow flexible content sizing
        const id = window.setTimeout(() => setMaxH('none'), 350);
        return () => window.clearTimeout(id);
      } else {
        // collapse: ensure element has a measured px max-height, then collapse to 0
        const h = el.scrollHeight;
        setMaxH(h + 'px');
        // next frame, set to 0 to trigger transition
        requestAnimationFrame(() => requestAnimationFrame(() => setMaxH('0px')));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    return (
      <div
        ref={innerRef}
        style={{
          maxHeight: maxH,
          overflow: 'hidden',
          transition: 'max-height 320ms cubic-bezier(.2,.8,.2,1), opacity 200ms ease',
          opacity: open ? 1 : 0,
        }}
        aria-hidden={!open}
      >
        {children}
      </div>
    );
  }

  const markRead = useCallback(async (n: any) => {
    if (!n?.id || n.read) return;
    try {
      await updateDoc(doc(db, "notifications", n.id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (e) {
      console.error("mark read failed", e);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = notes.filter((n) => !n.read);
    if (unread.length === 0) return;

    // Simple + safe: sequential updates (avoids needing writeBatch imports)
    for (const n of unread) {
      try {
        await updateDoc(doc(db, "notifications", n.id), {
          read: true,
          readAt: serverTimestamp(),
        });
      } catch (e) {
        console.error("mark all read failed for", n?.id, e);
      }
    }
  }, [notes]);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header (Notion/Linear style) */}
        <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                Inbox
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-text-primary">
                Notifications
              </h1>
              <p className="mt-2 text-sm text-text-muted">
                System alerts, integrity warnings, and session updates.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Pill tone={unreadCount > 0 ? "info" : "neutral"}>
                  {unreadCount} unread
                </Pill>
                <Pill>{notes.length} total</Pill>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className={cx(
                  "inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition",
                  unreadCount === 0
                    ? "border-stroke-subtle bg-surfaceAlt text-text-muted cursor-not-allowed"
                    : "border-stroke-subtle bg-surface text-text-primary hover:bg-surfaceAlt"
                )}
              >
                <CheckCheck className="h-4 w-4" />
                Mark all read
              </button>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="mt-6 space-y-3">
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : notes.length === 0 ? (
            <EmptyState />
          ) : (
            notes.map((n) => {
              const sender = n.sender || "system";
              const when = formatWhen(n.createdAt);
              const unread = !n.read;

              const locationLine =
                n?.meta &&
                [n.meta.city, n.meta.region, n.meta.country].filter(Boolean).join(", ");

              return (
                <div key={n.id} className="rounded-2xl border shadow-subtle transition">
                  <button
                    type="button"
                    onClick={() => {
                      // If invite type, navigate to accept flow
                      if (n.type === 'INVITE' && n?.meta?.inviteId) {
                        navigate(`/accept-invite?inviteId=${n.meta.inviteId}`);
                        markRead(n).catch(() => {});
                        return;
                      }
                      setOpenId(openId === n.id ? null : n.id)
                    }}
                    className={cx(
                      "w-full text-left rounded-2xl p-4 flex items-center justify-between",
                      unread ? "bg-brand-soft border-brand-secondary/25" : "bg-surface border-stroke-subtle hover:bg-surfaceAlt"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">{sender}</span>
                        {unread && <Pill tone="info">Unread</Pill>}
                      </div>
                      <div className="mt-2 text-sm text-text-primary truncate">{n.message}</div>
                    </div>
                    <div className="flex-shrink-0 text-xs text-text-muted text-right">
                      <div>{when}</div>
                    </div>
                  </button>

                  {/* Details panel: always in DOM for smooth transitions; animate via max-height + opacity */}
                  <Collapsible open={openId === n.id}>
                    <div className="mt-2 rounded-b-2xl border-t border-stroke-subtle">
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="text-sm text-text-primary mb-3">{n.message}</div>
                            {n.meta ? (
                              <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-3 mb-3">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">Context</div>
                                <div className="mt-2 grid gap-1 text-xs text-text-muted">
                                  <div>IP: <span className="text-text-primary">{n.meta.ip || "—"}</span></div>
                                  <div>Location: <span className="text-text-primary">{locationLine || "—"}</span></div>
                                  <div>Latitude: <span className="text-text-primary">{n.meta.latitude || '—'}</span></div>
                                  <div>Longitude: <span className="text-text-primary">{n.meta.longitude || '—'}</span></div>
                                </div>
                              </div>
                            ) : null}
                            <div className="text-xs text-text-muted">Received: {when}</div>
                          </div>

                          <div className="flex-shrink-0 flex flex-col items-end gap-2">
                            {!n.read ? (
                              <button type="button" onClick={() => markRead(n)} className="inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">
                                <Check className="h-4 w-4" />
                                Mark read
                              </button>
                            ) : (
                              <Pill tone="success">Read</Pill>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Collapsible>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}