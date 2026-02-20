// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { QRCodeCanvas } from "qrcode.react";
import AttendanceTable, { AttendanceRow } from "../../components/AttendanceTable";
import ExportButtons from "../../components/ExportButtons";
import { db, functions } from "../../firebase";
import { useToast } from "../../components/ToastProvider";

interface SessionData {
  moduleCode: string;
  title?: string;
  settings?: {
    windowSeconds: number;
    requireClassCode: boolean;
  };
  isActive: boolean;
  expiresAt: Date | null;
  qrExpiresAt: Date | null;
  requiredFields?: Record<string, boolean>;
  stats?: {
    submissionsCount?: number;
  };
}

interface PrivateSessionData {
  classCode?: string | null;
  token?: string | null;
  expiresAt?: Date | null;
  lastRotatedAt?: Date | null;
}

const renewOptions = [30, 60, 120, 300];
const extendOptions = [30, 60, 120];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s remaining`;
  return `${minutes}m ${secs.toString().padStart(2, "0")}s remaining`;
}

function SessionLive() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const location = useLocation();
  const locationState = (location.state || {}) as {
    initialClassCode?: string | null;
    initialToken?: string | null;
    initialExpiresAt?: string | null;
  };

  const [session, setSession] = useState<SessionData | null>(null);
  const [privateSession, setPrivateSession] = useState<PrivateSessionData>({
    classCode: locationState.initialClassCode || null,
    token: locationState.initialToken || null,
    expiresAt: locationState.initialExpiresAt ? new Date(locationState.initialExpiresAt) : null,
    lastRotatedAt: locationState.initialExpiresAt ? new Date(locationState.initialExpiresAt) : null
  });
  const [classCodePin, setClassCodePin] = useState<string | null>(null);
  const [pinRotationSeconds, setPinRotationSeconds] = useState<number>(30);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [filter, setFilter] = useState("");
  const [tick, setTick] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<any | null>(null);
  const [editReason, setEditReason] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnding, setConfirmEnding] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [extendLoading, setExtendLoading] = useState<number | null>(null);
  const [renewWindow, setRenewWindow] = useState<number | null>(null);
  const { showToast } = useToast();

  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const sessionRef = doc(db, "sessions", sessionId);
    const unsubscribe = onSnapshot(sessionRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setSession({
        moduleCode: data.moduleCode,
        title: data.title,
        settings: data.settings,
        isActive: data.isActive,
        expiresAt: data.expiresAt?.toDate ? data.expiresAt.toDate() : null,
        qrExpiresAt: data.qr?.expiresAt?.toDate ? data.qr.expiresAt.toDate() : null,
        requiredFields: data.requiredFields || {},
        stats: data.stats
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const privateRef = doc(db, "sessionsPrivate", sessionId);
    const unsubscribe = onSnapshot(privateRef, (snapshot) => {
      const data = snapshot.data();
      if (!data) return;
      setPrivateSession({
        classCode: data.classCodePlain || null,
        token: data.qrTokenPlain || null,
        expiresAt: data.qrExpiresAt?.toDate ? data.qrExpiresAt.toDate() : null,
        lastRotatedAt: data.lastRotatedAt?.toDate ? data.lastRotatedAt.toDate() : null
      });
    });
    return () => unsubscribe();
  }, [sessionId]);

  // fetch rotating PIN from server periodically when class code rotation enabled
  useEffect(() => {
    let timer: number | null = null;
    let mounted = true;
    async function fetchPin() {
      if (!sessionId || !session?.settings?.requireClassCode) return;
      try {
        const callable = httpsCallable(functions, "getSessionPin");
        const res: any = await callable({ sessionId });
        console.debug("getSessionPin response:", res);
        if (!mounted) return;
        setClassCodePin(res.data?.pin || null);
        setPinRotationSeconds(Number(res.data?.rotationSeconds || 30));
      } catch (e) {
        console.error("getSessionPin error:", e);
      }
    }

    if (session?.settings?.requireClassCode) {
      fetchPin();
      timer = window.setInterval(fetchPin, Math.max(1000, pinRotationSeconds * 1000));
    }
    return () => { mounted = false; if (timer) clearInterval(timer); };
  }, [sessionId, session?.settings?.requireClassCode, pinRotationSeconds]);

  useEffect(() => {
    if (!sessionId) return;
    const attendanceRef = collection(db, "sessions", sessionId, "attendance");
    const unsubscribe = onSnapshot(attendanceRef, (snapshot) => {
      const rows: AttendanceRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          studentNumber: data.studentNumber,
          name: data.name,
          surname: data.surname,
          email: data.email,
          initials: data.initials,
          group: data.group,
          status: data.status || "Present",
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : ""
        };
      });
      setAttendance(rows);
    });
    return () => unsubscribe();
  }, [sessionId]);

  const uniqueStudentCount = useMemo(() => {
    const ids = new Set(attendance.map((row) => row.studentNumber));
    return ids.size;
  }, [attendance]);

  const presentCount = session?.stats?.submissionsCount ?? uniqueStudentCount;

  const qrExpiresAt = privateSession.expiresAt || session?.qrExpiresAt || session?.expiresAt || null;
  const secondsRemaining = useMemo(() => {
    if (!qrExpiresAt) return 0;
    return Math.max(0, Math.floor((qrExpiresAt.getTime() - Date.now()) / 1000));
  }, [qrExpiresAt, tick]);

  const qrToken = privateSession.token;
  const qrUrl = sessionId && qrToken ? `${window.location.origin}/s/${sessionId}?t=${qrToken}` : "";

  const statusLabel = session?.isActive ? (secondsRemaining > 0 ? "ACTIVE" : "EXPIRED") : "ENDED";
  const statusColor = statusLabel === "ACTIVE" ? "bg-accent-success" : statusLabel === "EXPIRED" ? "bg-accent-warning" : "bg-stroke-strong";

  const baseWindowSeconds = session?.settings?.windowSeconds || 60;
  const chosenRenewWindow = renewWindow || baseWindowSeconds;

  const handleOpenDisplay = () => {
    if (!sessionId) return;
    const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
    window.open(displayUrl, "_blank", "noopener,noreferrer");
  };

  const handleRenewQr = async () => {
    if (!sessionId) return;
    setRenewing(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "renewSessionQr");
      await callable({ sessionId, windowSeconds: chosenRenewWindow });
      showToast({ message: "QR renewed", variant: "success" });
    } catch (err: any) {
      setActionError(err.message || "Failed to renew QR code");
      showToast({ message: err.message || "Failed to renew QR code", variant: "error" });
    } finally {
      setRenewing(false);
    }
  };

  const handleExtendTime = async (seconds: number) => {
    if (!sessionId) return;
    setExtendLoading(seconds);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "extendSessionWindow");
      await callable({ sessionId, extensionSeconds: seconds });
      showToast({ message: `Extended session by ${seconds}s`, variant: "success" });
    } catch (err: any) {
      setActionError(err.message || "Failed to extend session");
      showToast({ message: err.message || "Failed to extend session", variant: "error" });
    } finally {
      setExtendLoading(null);
    }
  };

  const handleEndSession = () => {
    setConfirmEnding(true);
  };

  const performEndSession = async () => {
    if (!sessionId) return;
    setEnding(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "endSession");
      await callable({ sessionId });
      setConfirmEnding(false);
      showToast({ message: "Session ended", variant: "success" });
    } catch (err: any) {
      setActionError(err.message || "Failed to end session");
      showToast({ message: err.message || "Failed to end session", variant: "error" });
    } finally {
      setEnding(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-transparent">
        <div className="container-md mt-6">
          <div className="flex h-64 items-center justify-center rounded-md border border-stroke-subtle bg-surface text-text-muted">
            Loading session...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border-b border-stroke-subtle pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">{session.moduleCode}</h1>
            {session.title && <p className="text-sm text-text-muted">{session.title}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className={`rounded-md px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white ${statusColor}`}>
              {statusLabel}
            </span>
            <span className="rounded-md border border-stroke-subtle px-3 py-1 text-sm font-medium text-text-muted">
              {formatDuration(secondsRemaining)}
            </span>
            <span className="rounded-md bg-brand-primary px-3 py-1 text-sm font-semibold text-white">
              {presentCount} Present
            </span>
            <ExportButtons sessionId={sessionId || ""} />
          </div>
        </div>

        {actionError && <p className="rounded-md border border-accent-error/30 bg-accent-error/5 px-3 py-2 text-sm text-accent-error">{actionError}</p>}

        <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
          <aside className="space-y-6 rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Session Controls</h2>
                {session.settings?.requireClassCode && privateSession.classCode && (
                  <span className="rounded-md bg-brand-primary px-2 py-1 text-xs font-semibold uppercase tracking-widest text-white">
                    Code {classCodePin || privateSession.classCode}
                  </span>
                )}
              </div>
              <div className="rounded-md border border-stroke-subtle bg-surfaceAlt p-4">
                {qrUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="rounded-md bg-surface p-2 shadow-subtle">
                      <QRCodeCanvas value={qrUrl} size={180} includeMargin level="H" />
                    </div>
                    <div className="text-center text-xs text-text-muted">
                      {qrUrl}
                    </div>
                    <div className="text-sm font-medium text-text-primary">{formatDuration(secondsRemaining)}</div>
                  </div>
                ) : (
                  <p className="text-sm text-text-muted">QR code not available yet.</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-text-muted">Renew window</label>
                <select
                  className="w-full rounded-md border border-stroke-subtle px-3 py-2 text-sm focus:border-brand-primary focus:outline-none"
                  value={chosenRenewWindow}
                  onChange={(event) => setRenewWindow(Number(event.target.value))}
                  disabled={!session.isActive}
                >
                  {renewOptions.map((option) => (
                    <option key={option} value={option}>
                      {option < 60 ? `${option}s` : `${option / 60} min`}
                    </option>
                  ))}
                  {!renewOptions.includes(baseWindowSeconds) && (
                    <option value={baseWindowSeconds}>
                      Default ({baseWindowSeconds < 60 ? `${baseWindowSeconds}s` : `${baseWindowSeconds / 60} min`})
                    </option>
                  )}
                </select>
              </div>

              <button
                type="button"
                className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-stroke-strong"
                onClick={handleRenewQr}
                disabled={!session.isActive || renewing}
              >
                {renewing ? "Renewing QR..." : "Renew QR"}
              </button>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Extend time</p>
                <div className="flex flex-wrap gap-2">
                  {extendOptions.map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      className="flex-1 rounded-md border border-stroke-subtle px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted transition hover:border-brand-primary/60 disabled:cursor-not-allowed disabled:border-stroke-subtle disabled:text-stroke-strong"
                      onClick={() => handleExtendTime(seconds)}
                      disabled={!session.isActive || extendLoading === seconds}
                    >
                      {extendLoading === seconds ? "Extending..." : `+${seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}`}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                className="w-full rounded-md bg-accent-error/10 px-4 py-2 text-sm font-semibold text-accent-error transition hover:bg-accent-error/20 disabled:cursor-not-allowed disabled:bg-accent-error/10"
                onClick={handleEndSession}
                disabled={ending || !session.isActive}
              >
                {ending ? "Ending..." : "End Session"}
              </button>

              <button
                type="button"
                className="w-full rounded-md border border-stroke-subtle px-4 py-2 text-sm font-semibold text-text-muted transition hover:bg-surfaceAlt"
                onClick={handleOpenDisplay}
              >
                Open Display Mode
              </button>
            </div>
          </aside>

          <section className="space-y-4 rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Live Attendance</h2>
                <p className="text-sm text-text-muted">Updates in real-time as students submit.</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  className="w-full rounded-md border border-stroke-subtle px-3 py-2 text-sm focus:border-brand-primary focus:outline-none sm:w-64"
                  placeholder="Search students..."
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <span className="text-sm text-text-muted">{attendance.length} submissions</span>
              </div>
            </div>

            <AttendanceTable data={attendance} globalFilter={filter} onGlobalFilterChange={setFilter} onEdit={(r) => { setEditingRow(r); setEditReason(""); }} />

            {editingRow && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-md rounded bg-white p-6">
                  <h3 className="text-lg font-semibold">Edit attendance — {editingRow.studentNumber}</h3>
                  <div className="mt-4 space-y-3">
                    {(() => {
                      const fieldOrder = ["name", "surname", "initials", "email", "group"];
                      return fieldOrder
                        .filter((k) => session.requiredFields && session.requiredFields[k])
                        .map((key) => {
                          const label = key.charAt(0).toUpperCase() + key.slice(1);
                          const value = editingRow[key] || "";
                          const inputProps = {
                            className: "w-full rounded border px-3 py-2",
                            value,
                            onChange: (e: any) => setEditingRow({ ...editingRow, [key]: e.target.value })
                          };
                          if (key === "email") {
                            return (
                              <div key={key}>
                                <label className="text-xs text-text-muted">{label}</label>
                                <input type="email" {...inputProps} />
                              </div>
                            );
                          }
                          return (
                            <div key={key}>
                              <label className="text-xs text-text-muted">{label}</label>
                              <input {...inputProps} />
                            </div>
                          );
                        });
                    })()}

                    <div>
                      <label className="text-xs text-text-muted">Status</label>
                      <select className="w-full rounded border px-3 py-2" value={editingRow.status} onChange={(e) => setEditingRow({ ...editingRow, status: e.target.value })}>
                        <option value="Present">Present</option>
                        <option value="Absent">Absent</option>
                        <option value="Excused">Excused</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs text-text-muted">Reason (required)</label>
                      <select className="w-full rounded border px-3 py-2" value={editReason} onChange={(e) => setEditReason(e.target.value)}>
                        <option value="">Select reason</option>
                        <option value="Phone died">Phone died</option>
                        <option value="Typo correction">Typo correction</option>
                        <option value="Duplicate entry removed">Duplicate entry removed</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button className="rounded border px-3 py-2" onClick={() => setEditingRow(null)}>Cancel</button>
                    <button className="rounded border bg-accent-error/10 px-3 py-2 text-accent-error" onClick={async () => {
                      // remove action
                      if (!window.confirm("Remove this attendance entry? This action is audited.")) return;
                      if (!sessionId) return;
                      setEditLoading(true);
                      try {
                        const callable = httpsCallable(functions, "editAttendance");
                        await callable({ sessionId, studentNumber: editingRow.studentNumber, action: "remove", reason: editReason });
                        setEditingRow(null);
                        showToast({ message: "Attendance entry removed", variant: "success" });
                      } catch (err: any) {
                        setActionError(err.message || "Failed to remove entry");
                        showToast({ message: err.message || "Failed to remove entry", variant: "error" });
                      } finally { setEditLoading(false); }
                    }}>Remove</button>
                    <button className="rounded bg-brand-primary px-3 py-2 text-white" onClick={async () => {
                      // edit/save action
                      if (!editReason) { setActionError("Reason required"); showToast({ message: "Reason required", variant: "error" }); return; }
                      if (!sessionId) return;
                      setEditLoading(true);
                      try {
                        const callable = httpsCallable(functions, "editAttendance");
                        const allowed = session.requiredFields || {};
                        const fieldsPayload: Record<string, any> = { status: editingRow.status };
                        ["name", "surname", "initials", "email", "group"].forEach((k) => {
                          if (allowed[k]) fieldsPayload[k] = editingRow[k];
                        });
                        await callable({ sessionId, studentNumber: editingRow.studentNumber, action: "edit", fields: fieldsPayload, reason: editReason });
                        setEditingRow(null);
                        showToast({ message: "Attendance updated", variant: "success" });
                      } catch (err: any) {
                        setActionError(err.message || "Failed to edit entry");
                        showToast({ message: err.message || "Failed to edit entry", variant: "error" });
                      } finally { setEditLoading(false); }
                    }}>{editLoading ? "Saving..." : "Save"}</button>
                  </div>
                </div>
              </div>
            )}
            {confirmEnding && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="w-full max-w-md rounded bg-white p-6">
                  <h3 className="text-lg font-semibold">End session</h3>
                  <p className="mt-3 text-sm text-text-muted">Ending the session will prevent students from submitting attendance. This action is audit-logged.</p>
                  <div className="mt-4 flex justify-end gap-2">
                    <button className="rounded border px-3 py-2" onClick={() => setConfirmEnding(false)} disabled={ending}>Cancel</button>
                    <button className="rounded bg-accent-error/10 px-3 py-2 text-accent-error" onClick={performEndSession} disabled={ending}>{ending ? "Ending..." : "End Session"}</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SessionLive;
