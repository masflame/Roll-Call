// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { QRCodeCanvas } from "qrcode.react";
import { 
  Clock, 
  Users, 
  QrCode, 
  RefreshCw, 
  PlusCircle, 
  XCircle, 
  Monitor,
  Search,
  AlertCircle,
  CheckCircle,
  Timer,
  Download,
  Edit,
  Trash2,
  Save,
  Ban
} from "lucide-react";
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

interface EditingRowData {
  studentNumber: string;
  name?: string;
  surname?: string;
  initials?: string;
  email?: string;
  group?: string;
  status: string;
  [key: string]: any;
}

const RENEW_OPTIONS = [30, 60, 120, 300];
const EXTEND_OPTIONS = [30, 60, 120];
const EDIT_REASONS = [
  "Phone died",
  "Typo correction",
  "Duplicate entry removed",
  "Wrong student number",
  "Late submission",
  "Other"
];

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Expired";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes === 0) return `${secs}s remaining`;
  if (secs === 0) return `${minutes}m remaining`;
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
  const [editingRow, setEditingRow] = useState<EditingRowData | null>(null);
  const [editReason, setEditReason] = useState<string>("");
  const [editLoading, setEditLoading] = useState(false);
  const [ending, setEnding] = useState(false);
  const [confirmEnding, setConfirmEnding] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [extendLoading, setExtendLoading] = useState<number | null>(null);
  const [renewWindow, setRenewWindow] = useState<number | null>(null);
  const { showToast } = useToast();

  // Timer for countdown
  useEffect(() => {
    const interval = setInterval(() => setTick((value) => value + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // Listen to session data
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

  // Listen to private session data
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

  // Fetch rotating PIN
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
        console.error("Error fetching PIN:", e);
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

  // Listen to attendance data
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
  const statusColor = getStatusColor(statusLabel);

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
      showToast({ message: "QR code renewed successfully", variant: "success" });
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
      showToast({ message: `Session extended by ${seconds} seconds`, variant: "success" });
    } catch (err: any) {
      setActionError(err.message || "Failed to extend session");
      showToast({ message: err.message || "Failed to extend session", variant: "error" });
    } finally {
      setExtendLoading(null);
    }
  };

  const performEndSession = async () => {
    if (!sessionId) return;
    setEnding(true);
    setActionError(null);
    try {
      const callable = httpsCallable(functions, "endSession");
      await callable({ sessionId });
      setConfirmEnding(false);
      showToast({ message: "Session ended successfully", variant: "success" });
    } catch (err: any) {
      setActionError(err.message || "Failed to end session");
      showToast({ message: err.message || "Failed to end session", variant: "error" });
    } finally {
      setEnding(false);
    }
  };

  const handleEditAttendance = async (action: "edit" | "remove") => {
    if (!editReason) {
      setActionError("Reason is required");
      showToast({ message: "Please select a reason", variant: "error" });
      return;
    }
    
    if (!sessionId || !editingRow) return;
    
    setEditLoading(true);
    setActionError(null);
    
    try {
      const callable = httpsCallable(functions, "editAttendance");
      
      if (action === "remove") {
        if (!window.confirm("Remove this attendance entry? This action will be logged.")) return;
        await callable({ 
          sessionId, 
          studentNumber: editingRow.studentNumber, 
          action: "remove", 
          reason: editReason 
        });
        showToast({ message: "Attendance entry removed", variant: "success" });
      } else {
        const allowed = session?.requiredFields || {};
        const fieldsPayload: Record<string, any> = { status: editingRow.status };
        
        ["name", "surname", "initials", "email", "group"].forEach((k) => {
          if (allowed[k]) fieldsPayload[k] = editingRow[k];
        });
        
        await callable({ 
          sessionId, 
          studentNumber: editingRow.studentNumber, 
          action: "edit", 
          fields: fieldsPayload, 
          reason: editReason 
        });
        showToast({ message: "Attendance updated successfully", variant: "success" });
      }
      
      setEditingRow(null);
      setEditReason("");
    } catch (err: any) {
      setActionError(err.message || `Failed to ${action} entry`);
      showToast({ message: err.message || `Failed to ${action} entry`, variant: "error" });
    } finally {
      setEditLoading(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-gray-500">
          <Clock className="h-5 w-5 animate-spin" />
          <span>Loading session...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
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

        {/* Error Alert */}
        {actionError && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <p className="text-sm text-red-700">{actionError}</p>
            </div>
          </div>
        )}

        {/* Main Grid */}
        <div className="grid gap-6 lg:grid-cols-[380px,1fr]">
          {/* Controls Sidebar */}
          <div className="space-y-6">
            {/* QR Code Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-700">Session QR Code</h2>
                  {session.settings?.requireClassCode && privateSession.classCode && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">Class Code:</span>
                      <span className="font-mono text-lg font-bold text-gray-900">
                        {classCodePin || privateSession.classCode}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-6">
                <div className="flex flex-col items-center">
                  {qrUrl ? (
                    <>
                      <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                        <QRCodeCanvas value={qrUrl} size={200} includeMargin level="H" />
                      </div>
                      <div className="mt-4 text-center">
                        <p className="text-xs text-gray-500 break-all">{qrUrl}</p>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <QrCode className="mx-auto h-12 w-12 text-gray-400" />
                      <p className="mt-2 text-sm text-gray-500">QR code not available</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Controls Card */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
                <h2 className="text-sm font-medium text-gray-700">Session Controls</h2>
              </div>
              
              <div className="p-6 space-y-4">
                {/* Renew Window Select */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Renew Window
                  </label>
                  <select
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                    value={chosenRenewWindow}
                    onChange={(event) => setRenewWindow(Number(event.target.value))}
                    disabled={!session.isActive}
                  >
                    {RENEW_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option < 60 ? `${option} seconds` : `${option / 60} minutes`}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Renew QR Button */}
                <button
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={handleRenewQr}
                  disabled={!session.isActive || renewing}
                >
                  {renewing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Renewing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Renew QR Code
                    </>
                  )}
                </button>

                {/* Extend Time Buttons */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    Extend Time
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {EXTEND_OPTIONS.map((seconds) => (
                      <button
                        key={seconds}
                        className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        onClick={() => handleExtendTime(seconds)}
                        disabled={!session.isActive || extendLoading === seconds}
                      >
                        {extendLoading === seconds ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          `+${seconds < 60 ? `${seconds}s` : `${seconds / 60}m`}`
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* End Session Button */}
                <button
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  onClick={() => setConfirmEnding(true)}
                  disabled={ending || !session.isActive}
                >
                  {ending ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Ending...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      End Session
                    </>
                  )}
                </button>

                {/* Display Mode Button */}
                <button
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={handleOpenDisplay}
                >
                  <Monitor className="h-4 w-4" />
                  Open Display Mode
                </button>
              </div>
            </div>
          </div>

          {/* Attendance Table Section */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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

            <div className="p-6">
              <AttendanceTable 
                data={attendance} 
                globalFilter={filter} 
                onGlobalFilterChange={setFilter} 
                onEdit={(row) => { 
                  setEditingRow(row); 
                  setEditReason(""); 
                }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Edit Attendance Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setEditingRow(null)} />
          
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Edit Attendance</h3>
              <p className="text-sm text-gray-500 mt-1">Student: {editingRow.studentNumber}</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Required Fields */}
              {session?.requiredFields && (
                <div className="space-y-3">
                  {["name", "surname", "initials", "email", "group"]
                    .filter((key) => session.requiredFields?.[key])
                    .map((key) => {
                      const label = key.charAt(0).toUpperCase() + key.slice(1);
                      return (
                        <div key={key}>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            {label}
                          </label>
                          <input
                            type={key === "email" ? "email" : "text"}
                            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                            value={editingRow[key] || ""}
                            onChange={(e) => setEditingRow({ ...editingRow, [key]: e.target.value })}
                          />
                        </div>
                      );
                    })}
                </div>
              )}

              {/* Status Select */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Status
                </label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={editingRow.status}
                  onChange={(e) => setEditingRow({ ...editingRow, status: e.target.value })}
                >
                  <option value="Present">Present</option>
                  <option value="Absent">Absent</option>
                  <option value="Excused">Excused</option>
                </select>
              </div>

              {/* Reason Select */}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Reason for Change <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                >
                  <option value="">Select a reason</option>
                  {EDIT_REASONS.map((reason) => (
                    <option key={reason} value={reason}>{reason}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setEditingRow(null)}
              >
                Cancel
              </button>
              
              <button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                onClick={() => handleEditAttendance("remove")}
                disabled={editLoading}
              >
                <Trash2 className="h-4 w-4" />
                Remove
              </button>
              
              <button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                onClick={() => handleEditAttendance("edit")}
                disabled={editLoading}
              >
                {editLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Session Confirmation Modal */}
      {confirmEnding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50" onClick={() => setConfirmEnding(false)} />
          
          <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
            <div className="border-b border-gray-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">End Session</h3>
            </div>
            
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-600 bg-amber-50 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 flex-shrink-0" />
                <p className="text-sm">
                  Ending the session will prevent students from submitting attendance. 
                  This action cannot be undone and will be logged.
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 px-6 py-4 flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                onClick={() => setConfirmEnding(false)}
                disabled={ending}
              >
                Cancel
              </button>
              
              <button
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
                onClick={performEndSession}
                disabled={ending}
              >
                {ending ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Ending...
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    End Session
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionLive;