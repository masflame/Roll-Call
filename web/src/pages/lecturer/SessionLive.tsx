// @ts-nocheck
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, useParams } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { QRCodeCanvas } from "qrcode.react";
import { Search, Timer, Users, Copy, CheckCircle, RefreshCw } from "lucide-react";
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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s remaining`;
  return `${minutes}m ${secs.toString().padStart(2, "0")}s remaining`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "bg-emerald-500";
    case "EXPIRED":
      return "bg-amber-500";
    case "ENDED":
      return "bg-gray-500";
    default:
      return "bg-gray-500";
  }
}

function ModalShell({
  title,
  description,
  children,
  onClose,
}: {
  title: string;
  description?: string;
  children: any;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
        <div className="border-b border-stroke-subtle px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-text-primary">{title}</h3>
              {description ? (
                <p className="mt-1 text-sm text-text-muted">{description}</p>
              ) : null}
            </div>
            <button
              className="rounded-lg px-2 py-1 text-sm font-semibold text-text-muted hover:bg-surfaceAlt"
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="inline-flex items-center gap-3 rounded-3xl border border-white/10 bg-white/5 px-3 py-1.5 backdrop-blur-sm shadow-sm">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <span className="text-sm font-semibold text-text-primary">{value}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
  type = "button",
}: any) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors",
        className
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, className }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center rounded-lg border border-stroke-subtle bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt disabled:cursor-not-allowed disabled:text-stroke-strong",
        className
      )}
    >
      {children}
    </button>
  );
}

function DangerButton({ children, onClick, disabled, className }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex items-center justify-center rounded-lg bg-accent-error/10 px-4 py-2 text-sm font-semibold text-accent-error transition hover:bg-accent-error/20 disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
    >
      {children}
    </button>
  );
}

function SelectField({ label, value, onChange, disabled, children }: any) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <select
        className="w-full rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-brand-primary disabled:cursor-not-allowed"
        value={value}
        onChange={onChange}
        disabled={disabled}
      >
        {children}
      </select>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: any) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </label>
      <input
        className="w-full rounded-xl border border-stroke-subtle bg-surface px-3 py-2 text-sm text-text-primary outline-none transition focus:border-brand-primary"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
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
    lastRotatedAt: locationState.initialExpiresAt ? new Date(locationState.initialExpiresAt) : null,
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
  const [copied, setCopied] = useState(false);

  const { showToast } = useToast();

  // Tick for countdown
  useEffect(() => {
    const interval = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Session document
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
        stats: data.stats,
      });
    });

    return () => unsubscribe();
  }, [sessionId]);

  // Private session document
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
        lastRotatedAt: data.lastRotatedAt?.toDate ? data.lastRotatedAt.toDate() : null,
      });
    });

    return () => unsubscribe();
  }, [sessionId]);

  // Rotating PIN polling (only if enabled)
  useEffect(() => {
    let timer: number | null = null;
    let mounted = true;

    async function fetchPin() {
      if (!sessionId || !session?.settings?.requireClassCode) return;
      try {
        const callable = httpsCallable(functions, "getSessionPin");
        const res: any = await callable({ sessionId });
        if (!mounted) return;
        setClassCodePin(res.data?.pin || null);
        setPinRotationSeconds(Number(res.data?.rotationSeconds || 30));
      } catch (e) {
        // intentionally silent (don’t clutter UI); keep console for dev
        console.error("getSessionPin error:", e);
      }
    }

    if (session?.settings?.requireClassCode) {
      fetchPin();
      timer = window.setInterval(fetchPin, Math.max(1000, pinRotationSeconds * 1000));
    }

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
    };
  }, [sessionId, session?.settings?.requireClassCode, pinRotationSeconds]);

  // Attendance collection
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
          submittedAt: data.submittedAt?.toDate ? data.submittedAt.toDate().toISOString() : "",
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

  const statusLabel = session?.isActive ? (secondsRemaining > 0 ? "Active" : "Expired") : "Ended";
  const statusTone =
    statusLabel === "Active" ? "success" : statusLabel === "Expired" ? "warning" : "neutral";

  const statusColor = getStatusColor(statusLabel.toUpperCase());

  const baseWindowSeconds = session?.settings?.windowSeconds || 60;
  const chosenRenewWindow = renewWindow || baseWindowSeconds;

  const statusBadgeClass = cx(
    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
    statusTone === "success"
      ? "border-accent-success/30 bg-accent-success/10 text-accent-success"
      : statusTone === "warning"
      ? "border-accent-warning/30 bg-accent-warning/10 text-accent-warning"
      : "border-stroke-subtle bg-surfaceAlt text-text-muted"
  );

  const clearError = useCallback(() => setActionError(null), []);

  const handleOpenDisplay = useCallback(() => {
    if (!sessionId) return;
    const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
    window.open(displayUrl, "_blank", "noopener,noreferrer");
  }, [sessionId]);

  const handleRenewQr = useCallback(async () => {
    if (!sessionId) return;
    setRenewing(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "renewSessionQr");
      await callable({ sessionId, windowSeconds: chosenRenewWindow });
      showToast({ message: "QR renewed", variant: "success" });
    } catch (err: any) {
      const msg = err.message || "Failed to renew QR code";
      setActionError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setRenewing(false);
    }
  }, [sessionId, chosenRenewWindow, showToast]);

  const handleExtendTime = useCallback(
    async (seconds: number) => {
      if (!sessionId) return;
      setExtendLoading(seconds);
      setActionError(null);
      try {
        const callable = httpsCallable(functions, "extendSessionWindow");
        await callable({ sessionId, extensionSeconds: seconds });
        showToast({ message: `Extended session by ${seconds}s`, variant: "success" });
      } catch (err: any) {
        const msg = err.message || "Failed to extend session";
        setActionError(msg);
        showToast({ message: msg, variant: "error" });
      } finally {
        setExtendLoading(null);
      }
    },
    [sessionId, showToast]
  );

  const handleEndSession = useCallback(() => setConfirmEnding(true), []);

  const performEndSession = useCallback(async () => {
    if (!sessionId) return;
    setEnding(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "endSession");
      await callable({ sessionId });
      setConfirmEnding(false);
      showToast({ message: "Session ended", variant: "success" });
    } catch (err: any) {
      const msg = err.message || "Failed to end session";
      setActionError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setEnding(false);
    }
  }, [sessionId, showToast]);

  const openEdit = useCallback((row: any) => {
    setEditingRow(row);
    setEditReason("");
    setActionError(null);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingRow(null);
    setEditReason("");
  }, []);

  const allowedFields = session?.requiredFields || {};

  const handleRemoveAttendance = useCallback(async () => {
    if (!sessionId || !editingRow) return;
    if (!editReason) {
      setActionError("Reason required");
      showToast({ message: "Reason required", variant: "error" });
      return;
    }
    if (!window.confirm("Remove this attendance entry? This action is audited.")) return;

    setEditLoading(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "editAttendance");
      await callable({
        sessionId,
        studentNumber: editingRow.studentNumber,
        action: "remove",
        reason: editReason,
      });
      closeEdit();
      showToast({ message: "Attendance entry removed", variant: "success" });
    } catch (err: any) {
      const msg = err.message || "Failed to remove entry";
      setActionError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setEditLoading(false);
    }
  }, [sessionId, editingRow, editReason, closeEdit, showToast]);

  const handleSaveAttendance = useCallback(async () => {
    if (!sessionId || !editingRow) return;
    if (!editReason) {
      setActionError("Reason required");
      showToast({ message: "Reason required", variant: "error" });
      return;
    }

    setEditLoading(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "editAttendance");

      const fieldsPayload: Record<string, any> = { status: editingRow.status };
      ["name", "surname", "initials", "email", "group"].forEach((k) => {
        if (allowedFields[k]) fieldsPayload[k] = editingRow[k];
      });

      await callable({
        sessionId,
        studentNumber: editingRow.studentNumber,
        action: "edit",
        fields: fieldsPayload,
        reason: editReason,
      });

      closeEdit();
      showToast({ message: "Attendance updated", variant: "success" });
    } catch (err: any) {
      const msg = err.message || "Failed to edit entry";
      setActionError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setEditLoading(false);
    }
  }, [sessionId, editingRow, editReason, allowedFields, closeEdit, showToast]);

  if (!session) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <div className="mt-6 flex h-56 items-center justify-center rounded-2xl border border-stroke-subtle bg-surface text-sm text-text-muted">
          Loading session…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 text-text-primary px-2 sm:px-0">
      {/* Top bar */}
      <div className="mb-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">{session.moduleCode}</h1>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${statusColor}`}>
                {statusLabel}
              </span>
            </div>
            {session.title && (
              <p className="mt-1 text-sm text-gray-500">{session.title}</p>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border border-gray-200">
              <Timer className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {formatDuration(secondsRemaining)}
              </span>
            </div>
            
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
              <Users className="h-4 w-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">
                {presentCount} Present
              </span>
            </div>
            
            <ExportButtons sessionId={sessionId || ""} />
          </div>
        </div>
      </div>

      {/* Error callout */}
      {actionError ? (
        <div className="flex items-start justify-between gap-4 rounded-2xl border border-accent-error/25 bg-accent-error/5 px-4 py-3">
          <p className="text-sm text-accent-error">{actionError}</p>
          <button
            className="rounded-lg px-2 py-1 text-sm font-semibold text-accent-error hover:bg-accent-error/10"
            onClick={clearError}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-[360px,1fr]">
        {/* Controls / QR */}
        <aside className="space-y-6 rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
          {/* QR card */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Session controls
              </h2>

              {session.settings?.requireClassCode && (classCodePin || privateSession.classCode) ? (
                <span className="rounded-full border border-stroke-subtle bg-surfaceAlt px-3 py-1 text-xs font-semibold text-text-primary">
                  Code <span className="font-mono">{classCodePin || privateSession.classCode}</span>
                </span>
              ) : null}
            </div>

            <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-4">
              {qrUrl ? (
                <div className="relative w-full flex flex-col items-center">
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="h-48 w-48 sm:h-64 sm:w-64 rounded-3xl bg-gradient-to-tr from-blue-400/18 to-indigo-400/08 blur-3xl opacity-50" />
                  </div>

                  <div className="relative z-10 bg-white p-3 rounded-3xl border border-gray-200 shadow-2xl w-52 sm:w-64 aspect-square flex items-center justify-center overflow-hidden">
                    <QRCodeCanvas value={qrUrl} size={400} includeMargin level="H" className="qr-code" />
                  </div>

                  <div className="mt-4 text-center">
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(qrUrl);
                          setCopied(true);
                          showToast({ message: "Link copied", variant: "success" });
                          setTimeout(() => setCopied(false), 1400);
                        } catch (e) {
                          showToast({ message: "Copy failed", variant: "error" });
                        }
                      }}
                      aria-label="Copy session link"
                      className="inline-flex items-center gap-2 text-sm text-gray-500 hover:underline"
                    >
                      <span className="break-all max-w-[220px]">{qrUrl}</span>
                      {copied ? (
                        <CheckCircle className="h-6 w-6 sm:h-4 sm:w-4 text-emerald-500" />
                      ) : (
                        <Copy className="h-6 w-6 sm:h-4 sm:w-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-muted">QR code not available yet.</p>
              )}
            </div>
          </div>

          {/* Renew + Extend */}
          <div className="space-y-4">
            <SelectField
              label="Renew window"
              value={chosenRenewWindow}
              onChange={(e: any) => setRenewWindow(Number(e.target.value))}
              disabled={!session.isActive}
            >
              {renewOptions.map((option) => (
                <option key={option} value={option}>
                  {option < 60 ? `${option}s` : `${option / 60} min`}
                </option>
              ))}
              {!renewOptions.includes(baseWindowSeconds) ? (
                <option value={baseWindowSeconds}>
                  Default{" "}
                  {baseWindowSeconds < 60
                    ? `(${baseWindowSeconds}s)`
                    : `(${baseWindowSeconds / 60} min)`}
                </option>
              ) : null}
            </SelectField>

            <PrimaryButton onClick={handleRenewQr} disabled={!session.isActive || renewing} className="w-full">
              {renewing ? "Renewing…" : "Renew QR"}
            </PrimaryButton>

            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
                Extend time
              </p>
              <div className="flex flex-wrap gap-2">
                {extendOptions.map((seconds) => (
                  <SecondaryButton
                    key={seconds}
                    onClick={() => handleExtendTime(seconds)}
                    disabled={!session.isActive || extendLoading === seconds}
                    className="flex-1"
                  >
                    {extendLoading === seconds
                      ? "Extending…"
                      : `+${seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}`}
                  </SecondaryButton>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <SecondaryButton onClick={handleOpenDisplay} className="w-full">
                Display mode
              </SecondaryButton>
              <DangerButton
                onClick={handleEndSession}
                disabled={ending || !session.isActive}
                className="w-full"
              >
                End session
              </DangerButton>
            </div>
          </div>
        </aside>

        {/* Attendance */}
        <section className="space-y-4 rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
          <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Live Attendance</h2>
                <p className="mt-1 text-sm text-gray-500">
                  {attendance.length} submission{attendance.length !== 1 ? 's' : ''}
                </p>
              </div>
              
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  className="w-full sm:w-64 rounded-lg border border-gray-200 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  placeholder="Search students..."
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
              </div>
            </div>
          </div>

          <AttendanceTable
            data={attendance}
            globalFilter={filter}
            onGlobalFilterChange={setFilter}
            onEdit={openEdit}
          />
        </section>
      </div>

      {/* Edit modal */}
      {editingRow ? (
        <ModalShell
          title={`Edit attendance — ${editingRow.studentNumber}`}
          description="Changes are audit-logged. A reason is required."
          onClose={closeEdit}
        >
          <div className="space-y-4">
            {/* Dynamic required fields */}
            <div className="grid gap-3">
              {["name", "surname", "initials", "email", "group"]
                .filter((k) => allowedFields && allowedFields[k])
                .map((key) => (
                  <TextField
                    key={key}
                    label={key}
                    value={editingRow[key] || ""}
                    onChange={(e: any) => setEditingRow({ ...editingRow, [key]: e.target.value })}
                    placeholder={`Enter ${key}`}
                  />
                ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField
                label="Status"
                value={editingRow.status || "Present"}
                onChange={(e: any) => setEditingRow({ ...editingRow, status: e.target.value })}
              >
                <option value="Present">Present</option>
                <option value="Absent">Absent</option>
                <option value="Excused">Excused</option>
              </SelectField>

              <SelectField
                label="Reason (required)"
                value={editReason}
                onChange={(e: any) => setEditReason(e.target.value)}
              >
                <option value="">Select…</option>
                <option value="Phone died">Phone died</option>
                <option value="Typo correction">Typo correction</option>
                <option value="Duplicate entry removed">Duplicate entry removed</option>
                <option value="Other">Other</option>
              </SelectField>
            </div>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <SecondaryButton onClick={closeEdit} disabled={editLoading}>
                Cancel
              </SecondaryButton>

              <DangerButton onClick={handleRemoveAttendance} disabled={editLoading}>
                {editLoading ? "Working…" : "Remove"}
              </DangerButton>

              <PrimaryButton onClick={handleSaveAttendance} disabled={editLoading}>
                {editLoading ? "Saving…" : "Save"}
              </PrimaryButton>
            </div>
          </div>
        </ModalShell>
      ) : null}

      {/* End session confirm */}
      {confirmEnding ? (
        <ModalShell
          title="End session"
          description="Ending prevents new submissions. This action is audit-logged."
          onClose={() => setConfirmEnding(false)}
        >
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setConfirmEnding(false)} disabled={ending}>
              Cancel
            </SecondaryButton>
            <DangerButton onClick={performEndSession} disabled={ending}>
              {ending ? "Ending…" : "End session"}
            </DangerButton>
          </div>
        </ModalShell>
      ) : null}
    </div>
  );
}

export default SessionLive;
