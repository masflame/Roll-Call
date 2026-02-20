// // // // @ts-nocheck
// // // import { Link } from "react-router-dom";
// // // // removed inline analytics panel to declutter; use dedicated Analytics page

// // // function Dashboard() {
// @ts-nocheck
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../firebase";
import { useToast } from "../../components/ToastProvider";
import { Card, Pill, PrimaryButton, SecondaryButton } from "../../components/ui";

function Dashboard() {
  const user = auth.currentUser;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [queuedSchedules, setQueuedSchedules] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "schedules");
    const q = query(ref, where("lecturerId", "==", user.uid), orderBy("scheduledAt", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      setQueuedSchedules(items.filter((s) => (s.status || 'queued') === 'queued'));
    });
    return () => unsub();
  }, [user]);

  const startSchedule = async (s: any) => {
    if (!user) return;
    try {
      // open a blank window synchronously to avoid popup blockers
      let displayWindow: Window | null = null;
      try { displayWindow = window.open("", "_blank"); } catch { displayWindow = null; }

      const callable = httpsCallable(functions, "createSession");
      let moduleCode = s.moduleCode || "";
      if (!moduleCode && s.moduleId) {
        try {
          const modSnap = await getDoc(doc(db, "modules", s.moduleId));
          if (modSnap.exists()) moduleCode = (modSnap.data() as any)?.moduleCode || "";
        } catch (err) {
          // ignore; server validation will surface if still missing
        }
      }
      const payload = {
        moduleId: s.moduleId,
        moduleCode,
        title: s.title || "",
        windowSeconds: s.windowSeconds || 60,
        requiredFields: s.requiredFields || {},
        requireClassCode: s.requireClassCode || false
      };
      const result = (await callable(payload)) as any;
      const sessionId = result?.data?.sessionId;
      if (sessionId) {
        await updateDoc(doc(db, "schedules", s.id), { status: "started", startedAt: new Date(), sessionId });

        const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
        if (displayWindow) {
          try { displayWindow.location.href = displayUrl; } catch { window.open(displayUrl, "_blank", "noopener,noreferrer"); }
        } else {
          window.open(displayUrl, "_blank", "noopener,noreferrer");
        }

        showToast({ message: "Started scheduled session", variant: "success" });
        navigate(`/sessions/${sessionId}/live`, {
          state: {
            initialExpiresAt: result?.data?.qrExpiresAt || result?.data?.expiresAt,
            initialClassCode: result?.data?.classCode || null,
            initialToken: result?.data?.qrToken || null,
            openedDisplay: true
          }
        });
      }
    } catch (err: any) {
      showToast({ message: err?.message || "Failed to start schedule", variant: "error" });
    }
  };

  const metrics = [
    {
      label: "Status",
      value: "No session in progress",
      hint: "Start a session to begin capturing attendance.",
      tone: "neutral",
    },
    {
      label: "Today",
      value: "0 classes scheduled",
      hint: "Build a timetable from your assigned modules.",
      tone: "info",
    },
    {
      label: "Recent",
      value: "0 submissions",
      hint: "Live submissions appear while a session is active.",
      tone: "success",
    },
  ];

  const pills = [
    { label: "Start new session", to: "/sessions/new", kind: "primary" },
    { label: "View live panel", to: "/sessions/new", kind: "secondary" },
    { label: "Configure workspace", to: "/settings", kind: "ghost" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Compact page title — hide on large screens so shell header is primary */}
      <div className="mb-2 lg:hidden">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Dashboard</h1>
        <p className="mt-1 text-sm text-text-muted">Key session controls and quick links.</p>
      </div>

      {/* Metrics row: denser cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {metrics.map((m) => (
          <Card key={m.label} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{m.label}</div>
                <div className="mt-1 text-lg font-semibold text-text-primary">{m.value}</div>
                <div className="mt-1 text-xs text-text-muted">{m.hint}</div>
              </div>
              <div className="shrink-0">
                <Pill tone={m.tone === "success" ? "success" : m.tone === "info" ? "neutral" : "neutral"}>{m.tone.toUpperCase()}</Pill>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Main content */}
      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
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
              <div className="rounded-lg border border-stroke-subtle bg-surfaceAlt p-3 text-sm text-text-muted">
                No classes scheduled
              </div>
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
              <div className="rounded-xl border border-dashed border-stroke-subtle bg-surfaceAlt p-4">
                <p className="text-sm font-semibold text-text-primary">Nothing yet</p>
                <p className="mt-1 text-sm text-text-muted">
                  Start a session and live submissions will show up here.
                </p>

                
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Dashboard;
