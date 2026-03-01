// @ts-nocheck
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  getDoc,
  limit,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../firebase";
import { useToast } from "../../components/ToastProvider";
import {
  Calendar,
  PlayCircle,
  Clock,
  Activity,
  BarChart3,
  BookOpen,
  ShieldAlert,
  ArrowUpRight,
  Sparkles,
  Bell,
  ChevronRight,
  TimerReset,
} from "lucide-react";
import { PrimaryButton } from "../../components/ui";

/**
 * Notion-inspired Dashboard
 * - clean blocks, actionable widgets, "Today" view, queued schedules, recent sessions, integrity alerts, quick actions
 * - includes mock sections you can wire later (integrity + insights)
 * - uses your existing startSchedule logic + Firestore schedules listener
 */

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatWhen(ts: any) {
  try {
    const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
    if (!d) return "—";
    return d.toLocaleString();
  } catch {
    return "—";
  }
}

function isTodayDate(d: Date) {
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function Block({
  title,
  description,
  right,
  children,
  className,
}: any) {
  return (
    <section
      className={cx(
        "rounded-2xl border border-stroke-subtle bg-surface shadow-subtle overflow-hidden",
        className
      )}
    >
      <div className="flex flex-col gap-2 border-b border-stroke-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-text-muted">{description}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, icon: Icon, hint, tone }: any) {
  const toneCls =
    tone === "success"
      ? "bg-accent-success/10 border-accent-success/20"
      : tone === "warning"
        ? "bg-accent-warning/10 border-accent-warning/20"
        : tone === "danger"
          ? "bg-accent-error/10 border-accent-error/20"
          : "bg-surfaceAlt border-stroke-subtle";

  return (
    <div className={cx("rounded-2xl border p-4", toneCls)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {label}
          </div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">
            {value}
          </div>
          {hint && (
            <div className="mt-2 text-xs text-text-muted leading-snug">
              {hint}
            </div>
          )}
        </div>
        {Icon && (
          <div className="rounded-xl border border-stroke-subtle bg-white/50 p-2">
            <Icon className="h-4 w-4 text-text-muted" />
          </div>
        )}
      </div>
    </div>
  );
}

function RowAction({ to, title, desc }: any) {
  return (
    <Link
      to={to}
      className="group flex items-start justify-between gap-3 rounded-xl border border-stroke-subtle bg-surface px-4 py-3 transition hover:bg-surfaceAlt"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="mt-1 text-sm text-text-muted">{desc}</div>
      </div>
      <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-text-muted">
        Open <ArrowUpRight className="h-3.5 w-3.5 opacity-70" />
      </span>
    </Link>
  );
}

function Badge({ children, tone = "neutral" }: any) {
  const cls =
    tone === "success"
      ? "border-accent-success/20 bg-accent-success/10 text-accent-success"
      : tone === "warning"
        ? "border-accent-warning/20 bg-accent-warning/10 text-accent-warning"
        : tone === "danger"
          ? "border-accent-error/20 bg-accent-error/10 text-accent-error"
          : "border-stroke-subtle bg-surfaceAlt text-text-muted";

  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold",
        cls
      )}
    >
      {children}
    </span>
  );
}

export default function Dashboard() {
    const user = auth.currentUser;
    const { showToast } = useToast();
    const navigate = useNavigate();

    // Listen for unread notifications for this user
    useEffect(() => {
      if (!user) return;
      let unsub: (() => void) | null = null;
      try {
        const notRef = collection(db, 'notifications');
        const q = query(notRef, where('userId', '==', user.uid), where('read', '==', false), orderBy('createdAt', 'desc'));
        unsub = onSnapshot(q, (snap) => {
          setNotifications(snap.size || 0);
        }, (err) => {
          console.error('notifications listener error', err);
        });
      } catch (e) {
        console.error('failed to start notifications listener', e);
      }
      return () => { if (unsub) unsub(); };
    }, [user]);

  // live Firestore bits you already had
  const [queuedSchedules, setQueuedSchedules] = useState<any[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({
    activeSessions: null,
    classesToday: null,
    queued: null,
    recentSubmissions: null,
    integrityFlags: null,
  });
  // Notification count (unread)
  const [notifications, setNotifications] = useState<number>(0);

  // mock “insights” (wire later)
  const mockInsights = useMemo(
    () => [
      {
        id: "ins-1",
        title: "Attendance dipped in one module",
        desc: "COS151: down 12% vs last week. Consider announcing the rotation code earlier.",
        action: { label: "Open Analytics", to: "/analytics" },
        tone: "warning",
      },
      {
        id: "ins-2",
        title: "Best check-in window",
        desc: "Your fastest completion happens within 60s. Use 60s QR for high-integrity sessions.",
        action: { label: "Create Session", to: "/sessions/new" },
        tone: "success",
      },
      {
        id: "ins-3",
        title: "Roster coverage incomplete",
        desc: "One module has no roster uploaded — exports will miss expected counts.",
        action: { label: "Manage Modules", to: "/modules" },
        tone: "danger",
      },
    ],
    []
  );

  useEffect(() => {
    if (!user) return;

    // Schedules (queued)
    const schedRef = collection(db, "schedules");
    const schedQ = query(
      schedRef,
      where("lecturerId", "==", user.uid),
      orderBy("scheduledAt", "asc")
    );

    const unsubSchedules = onSnapshot(schedQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      const queued = items.filter((s) => (s.status || "queued") === "queued");
      setQueuedSchedules(queued);

      // classes today from schedules
      const todayStart = startOfToday().getTime();
      const todayEnd = endOfToday().getTime();
      const todayCount = items.filter((s) => {
        const when = s.scheduledAt?.toDate
          ? s.scheduledAt.toDate()
          : s.scheduledAt
            ? new Date(s.scheduledAt)
            : null;
        if (!when) return false;
        const t = when.getTime();
        return t >= todayStart && t <= todayEnd;
      }).length;

      setStats((p: any) => ({
        ...p,
        classesToday: todayCount,
        queued: queued.length,
      }));
    });

    // Recent sessions (mock + lightweight real)
    const sessRef = collection(db, "sessions");
    const sessQ = query(
      sessRef,
      where("lecturerId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(6)
    );

    const unsubSessions = onSnapshot(sessQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      setRecentSessions(items);

      const now = Date.now();
      const active = items.filter((s) => {
        const expiresAt = s.expiresAt?.toDate
          ? s.expiresAt.toDate().getTime()
          : s.expiresAt
            ? new Date(s.expiresAt).getTime()
            : null;
        return s.isActive && (!expiresAt || expiresAt > now);
      }).length;

      const recentSubmissions = items.reduce(
        (acc: number, s: any) => acc + (s.stats?.submissionsCount || 0),
        0
      );

      // integrityFlags: placeholder until you wire it
      const integrityFlags = 2; // mock

      setStats((p: any) => ({
        ...p,
        activeSessions: active,
        recentSubmissions,
        integrityFlags,
      }));
    });

    return () => {
      unsubSchedules();
      unsubSessions();
    };
  }, [user]);

  const startSchedule = async (s: any) => {
    if (!user) return;
    try {
      // open a blank window synchronously to avoid popup blockers
      let displayWindow: Window | null = null;
      try {
        displayWindow = window.open("", "_blank");
      } catch {
        displayWindow = null;
      }

      const callable = httpsCallable(functions, "createSession");
      let moduleCode = s.moduleCode || "";
      if (!moduleCode && s.moduleId) {
        try {
          const modSnap = await getDoc(doc(db, "modules", s.moduleId));
          if (modSnap.exists()) moduleCode = (modSnap.data() as any)?.moduleCode || "";
        } catch {
          // ignore; server validation will surface if still missing
        }
      }

      const payload = {
        moduleId: s.moduleId,
        moduleCode,
        title: s.title || "",
        windowSeconds: s.windowSeconds || 60,
        requiredFields: s.requiredFields || {},
        requireClassCode: s.requireClassCode || false,
      };

      const result = (await callable(payload)) as any;
      const sessionId = result?.data?.sessionId;

      if (sessionId) {
        await updateDoc(doc(db, "schedules", s.id), {
          status: "started",
          startedAt: new Date(),
          sessionId,
        });

        const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
        if (displayWindow) {
          try {
            displayWindow.location.href = displayUrl;
          } catch {
            window.open(displayUrl, "_blank", "noopener,noreferrer");
          }
        } else {
          window.open(displayUrl, "_blank", "noopener,noreferrer");
        }

        showToast({ message: "Started scheduled session", variant: "success" });
        navigate(`/sessions/${sessionId}/live`, {
          state: {
            initialExpiresAt: result?.data?.qrExpiresAt || result?.data?.expiresAt,
            initialClassCode: result?.data?.classCode || null,
            initialToken: result?.data?.qrToken || null,
            openedDisplay: true,
          },
        });
      }
    } catch (err: any) {
      showToast({ message: err?.message || "Failed to start schedule", variant: "error" });
    }
  };

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }, []);

  return (
    <div className="w-full space-y-6">
      {/* Notion-like header block */}
      <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle overflow-hidden">
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stroke-subtle bg-surfaceAlt">
                  <Sparkles className="h-4 w-4 text-text-muted" />
                </span>
                <div>
                  <h1 className="text-xl font-semibold text-text-primary">Dashboard</h1>
                  <p className="mt-1 text-sm text-text-muted">
                    Today: <span className="font-semibold text-text-primary/90">{todayLabel}</span>
                    {" · "}
                    Run sessions, monitor integrity, and keep schedules on track.
                  </p>
                </div>
              </div>

              {/* tiny “breadcrumb-ish” line */}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <Badge tone="success">
                  <Activity className="mr-1 h-3.5 w-3.5" /> System online
                </Badge>
                <Badge>
                  <Clock className="mr-1 h-3.5 w-3.5" /> Lecturer workspace
                </Badge>
                <Badge tone="warning">
                  <ShieldAlert className="mr-1 h-3.5 w-3.5" /> Integrity signals enabled
                </Badge>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              {notifications > 0 && (
                <button
                  onClick={() => navigate("/notifications")}
                  className="relative inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                >
                  <Bell className="h-4 w-4 text-text-muted" />
                  Notifications
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
                </button>
              )}
              <button
                onClick={() => navigate("/sessions/new")}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90"
              >
                <PlayCircle className="h-4 w-4" />
                Start session
              </button>
            </div>
          </div>
        </div>

        {/* metrics row */}
        <div className="border-t border-stroke-subtle bg-surfaceAlt/30 px-5 py-4 sm:px-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="Active sessions"
              value={stats.activeSessions ?? "—"}
              icon={Activity}
              hint="Sessions currently accepting submissions."
              tone={stats.activeSessions ? "success" : "neutral"}
            />
            <MetricCard
              label="Classes today"
              value={stats.classesToday ?? "—"}
              icon={Calendar}
              hint="From your schedules (and later: timetable)."
              tone={stats.classesToday ? "neutral" : "neutral"}
            />
            <MetricCard
              label="Queued schedules"
              value={stats.queued ?? "—"}
              icon={TimerReset}
              hint="Ready to start immediately."
              tone={stats.queued ? "warning" : "neutral"}
            />
            <MetricCard
              label="Integrity alerts"
              value={stats.integrityFlags ?? "—"}
              icon={ShieldAlert}
              hint="Mock for now — wire your flags feed."
              tone={stats.integrityFlags ? "warning" : "neutral"}
            />
          </div>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Today’s classes */}
          <Block
            title="Today’s plan"
            description="What’s coming up, what needs action, and what you can start now."
            right={
              <Link
                to="/schedules"
                className="inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
              >
                Manage schedules <ChevronRight className="h-4 w-4 text-text-muted" />
              </Link>
            }
          >
            {/* Mock: timetable-style items you can later derive from schedules + recurrence */}
            <div className="space-y-3">
              {[
                {
                  id: "t1",
                  time: "08:00",
                  title: "COS151 — Lecture",
                  room: "B12 (Main Campus)",
                  status: "Upcoming",
                  tone: "neutral",
                },
                {
                  id: "t2",
                  time: "11:30",
                  title: "INF272 — Lab",
                  room: "Lab 3",
                  status: "Needs roster check",
                  tone: "warning",
                },
                {
                  id: "t3",
                  time: "14:00",
                  title: "WST110 — Tutorial",
                  room: "Online",
                  status: "Ready",
                  tone: "success",
                },
              ].map((it) => (
                <div
                  key={it.id}
                  className="flex flex-col gap-3 rounded-2xl border border-stroke-subtle bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="mt-0.5 w-14 text-xs font-semibold text-text-muted">
                      {it.time}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {it.title}
                      </div>
                      <div className="mt-1 text-xs text-text-muted truncate">
                        {it.room}
                      </div>
                      <div className="mt-2">
                        <Badge tone={it.tone}>{it.status}</Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    <button
                      onClick={() => navigate("/sessions/new")}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-text-onBrand transition hover:bg-brand-primary/90"
                    >
                      <PlayCircle className="h-4 w-4" />
                      Start
                    </button>
                    <Link
                      to="/modules"
                      className="inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                    >
                      Check module <ArrowUpRight className="h-4 w-4 text-text-muted" />
                    </Link>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt px-4 py-3 text-sm text-text-muted">
                Later: this block can auto-generate from <span className="font-semibold">Schedules</span> +
                recurrence rules + your modules.
              </div>
            </div>
          </Block>

          {/* Scheduled sessions list (real queued) */}
          <Block
            title="Queued schedules"
            description="These are ready to start now. Starting opens Display Mode and the Live Console."
            right={
              <Link
                to="/schedules"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary transition hover:underline"
              >
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="space-y-3">
              {queuedSchedules.length === 0 ? (
                <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt px-4 py-4 text-sm text-text-muted">
                  No queued schedules. Create one in <Link className="font-semibold text-brand-primary hover:underline" to="/schedules">Schedules</Link>.
                </div>
              ) : (
                queuedSchedules.slice(0, 6).map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-col gap-3 rounded-2xl border border-stroke-subtle bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-text-primary">
                          {s.title || s.moduleCode || "Untitled"}
                        </div>
                        <Badge tone="warning">queued</Badge>
                        {s.requireClassCode && <Badge tone="neutral">class code</Badge>}
                        {s.concurrent && <Badge tone="neutral">concurrent</Badge>}
                      </div>
                      <div className="mt-1 text-xs text-text-muted">
                        {formatWhen(s.scheduledAt)}
                      </div>
                      <div className="mt-1 text-xs text-text-muted truncate">
                        {(s.instructors || []).join(", ") || "—"} · {s.recurrence || "No recurrence"} ·{" "}
                        {s.windowSeconds ? `${s.windowSeconds}s window` : "—"}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => startSchedule(s)}
                        className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-text-onBrand transition hover:bg-brand-primary/90"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Start
                      </button>
                      <Link
                        to="/schedules"
                        className="inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                      >
                        Edit <ChevronRight className="h-4 w-4 text-text-muted" />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Block>

          {/* Recent sessions (real) */}
          <Block
            title="Recent sessions"
            description="Quick jump to Live Console (if active) or History exports."
            right={
              <Link
                to="/history"
                className="inline-flex items-center gap-2 text-sm font-semibold text-brand-primary transition hover:underline"
              >
                Open history <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="space-y-2">
              {recentSessions.length === 0 ? (
                <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt px-4 py-4 text-sm text-text-muted">
                  No sessions yet. Start your first attendance session.
                </div>
              ) : (
                recentSessions.map((s: any) => {
                  const createdAt = s.createdAt?.toDate ? s.createdAt.toDate() : null;
                  const isActive = !!s.isActive;
                  const subs = s.stats?.submissionsCount ?? 0;

                  return (
                    <div
                      key={s.id}
                      className="flex flex-col gap-2 rounded-2xl border border-stroke-subtle bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="truncate text-sm font-semibold text-text-primary">
                            {s.moduleCode || "Module"}{s.title ? ` — ${s.title}` : ""}
                          </div>
                          <Badge tone={isActive ? "success" : "neutral"}>{isActive ? "active" : "closed"}</Badge>
                          <Badge>{subs} submissions</Badge>
                        </div>
                        <div className="mt-1 text-xs text-text-muted">
                          {createdAt ? createdAt.toLocaleString() : "—"} · Session ID: {" "}
                          <span className="font-mono">{s.id}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {isActive ? (
                          <button
                            onClick={() => navigate(`/sessions/${s.id}/live`)}
                            className="inline-flex items-center gap-2 rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-text-onBrand transition hover:bg-brand-primary/90"
                          >
                            <Activity className="h-4 w-4" />
                            Open live
                          </button>
                        ) : (
                          <Link
                            to={`/history/${s.id}`}
                            className="inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                          >
                            View / Export <ArrowUpRight className="h-4 w-4 text-text-muted" />
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Block>
        </div>

        {/* RIGHT COLUMN */}
        <aside className="space-y-6">
          {/* Quick actions */}
          <Block
            title="Quick actions"
            description="Jump straight to high-impact tasks."
          >
            <div className="space-y-3">
              <RowAction
                to="/sessions/new"
                title="Start a session"
                desc="Generate QR + Live Console in one flow."
              />
              <RowAction
                to="/analytics"
                title="Open analytics"
                desc="Heatmaps, trends, integrity signals, exports."
              />
              <RowAction
                to="/modules"
                title="Manage modules"
                desc="Upload rosters, set defaults, control requirements."
              />
              <RowAction
                to="/settings/shared-access"
                title="Delegates & access"
                desc="Invite TAs and co-lecturers with permissions."
              />
            </div>
          </Block>

          {/* Insights (mock) */}
          <Block
            title="Insights"
            description="Actionable coaching (mock for now — wire to your stats engine)."
          >
            <div className="space-y-3">
              {mockInsights.map((ins) => (
                <div
                  key={ins.id}
                  className="rounded-2xl border border-stroke-subtle bg-surface px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-text-primary">
                          {ins.title}
                        </div>
                        <Badge tone={ins.tone}>{ins.tone}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-text-muted">{ins.desc}</div>
                    </div>
                    <Link
                      to={ins.action.to}
                      className="shrink-0 inline-flex items-center gap-2 rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                    >
                      {ins.action.label} <ArrowUpRight className="h-4 w-4 text-text-muted" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Block>

          {/* Integrity feed (mock) */}
          <Block
            title="Integrity feed"
            description="Latest suspicious patterns (mock content)."
          >
            <div className="space-y-3 text-sm">
              {[
                {
                  id: "f1",
                  type: "velocity_short_window",
                  desc: "8 submissions in 6 seconds (possible sharing).",
                  tone: "warning",
                },
                {
                  id: "f2",
                  type: "duplicate_fingerprint",
                  desc: "Same device fingerprint used across 3 students.",
                  tone: "danger",
                },
              ].map((f) => (
                <div
                  key={f.id}
                  className="rounded-2xl border border-stroke-subtle bg-surface px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-text-primary">
                          {f.type}
                        </div>
                        <Badge tone={f.tone}>{f.tone}</Badge>
                      </div>
                      <div className="mt-1 text-sm text-text-muted">{f.desc}</div>
                    </div>
                    <Link
                      to="/analytics"
                      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"
                    >
                      Review <ArrowUpRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt px-4 py-3 text-sm text-text-muted">
                Wire this to: session integrity flags → moduleStats → analytics drill-down.
              </div>
            </div>
          </Block>
        </aside>
      </div>
        {/* Today table */}
        <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
          <div className="flex flex-col gap-3 border-b border-stroke-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Today’s classes</h2>
              <p className="mt-1 text-sm text-text-muted">
                Generated from your modules and timetable rules.
              </p>
            </div>

            
          </div>

          <div className="p-4">
            <div className="grid gap-3">
              {/* Only show if there are real classes; otherwise, show nothing */}
            </div>
          </div>

          {/* Subtle footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke-subtle p-5">
            <p className="text-xs text-text-muted">
              Tip: once modules are loaded, RollCall can auto-build your weekly timetable.
            </p>

            <div className="flex items-center gap-2">
              <Link
                to="/history"
                className="rounded-full px-3 py-2 text-sm font-semibold text-brand-secondary transition hover:bg-brand-soft"
              >
                Attendance history
              </Link>
            </div>
          </div>
        </div>

          {/* Scheduled sessions quick list */}
          <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle mt-4">
            <div className="border-b border-stroke-subtle p-5">
              <h2 className="text-lg font-semibold text-text-primary">Scheduled sessions</h2>
              <p className="mt-1 text-sm text-text-muted">Queued schedules you can start immediately.</p>
            </div>
            <div className="p-4 space-y-3">
              {queuedSchedules.length === 0 ? (
                <div className="text-sm text-text-muted">No queued schedules</div>
              ) : (
                queuedSchedules.slice(0,5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary">{s.title || s.moduleCode || 'Untitled'}</div>
                      <div className="text-xs text-text-muted">{s.scheduledAt?.toDate ? new Date(s.scheduledAt.toDate()).toLocaleString() : s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'}</div>
                      <div className="mt-1 text-xs text-text-muted">{(s.instructors || []).join(', ') || '—'} · {s.recurrence || 'No recurrence'}</div>
                    </div>
                    <div className="shrink-0">
                      <PrimaryButton onClick={() => startSchedule(s)}>Start</PrimaryButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        {/* Right column: quick links + recent */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
            <div className="border-b border-stroke-subtle p-5">
              <h2 className="text-lg font-semibold text-text-primary">Quick actions</h2>
              <p className="mt-1 text-sm text-text-muted">
                Jump straight to what you need.
              </p>
            </div>

            <div className="p-2">
              <Link
                to="/analytics"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Analytics</p>
                  <p className="text-sm text-text-muted">
                    Trends, heatmaps, integrity insights, exports.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>

              <Link
                to="/modules"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Modules</p>
                  <p className="text-sm text-text-muted">
                    Upload class lists, manage venues, session defaults.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>

              <Link
                to="/history"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Archive</p>
                  <p className="text-sm text-text-muted">
                    Search past sessions and export CSV/PDF.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
            <div className="border-b border-stroke-subtle p-5">
              <h2 className="text-lg font-semibold text-text-primary">Recent activity</h2>
              <p className="mt-1 text-sm text-text-muted">
                Latest sessions and submissions across modules.
              </p>
            </div>

            <div className="p-5">
              {/* Only show recent activity if there is real data; otherwise, show nothing */}
            </div>
          </div>

        </aside>
      </div>
  );
}

