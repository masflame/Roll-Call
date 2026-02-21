// @ts-nocheck
import { FormEvent, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, limit, getDoc, doc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "../../firebase";
import PageHeader from "../../components/PageHeader";
import { PlayCircle } from "lucide-react";
import { useToast } from "../../components/ToastProvider";

interface ModuleOption {
  id: string;
  moduleCode: string;
  moduleName?: string;
}

const windowOptions = [
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 },
  { label: "2 minutes", value: 120 },
  { label: "5 minutes", value: 300 }
];

function CreateSession() {
  const user = auth.currentUser;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({
    name: false,
    surname: false,
    initials: false,
    email: false,
    group: false
  });
  const [requireClassCode, setRequireClassCode] = useState(false);
  const [classCodeRotationSeconds, setClassCodeRotationSeconds] = useState<number>(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const modulesRef = collection(db, "modules");
    const unsubscribe = onSnapshot(query(modulesRef), (snapshot) => {
      const data = snapshot.docs
        .filter((docSnap) => docSnap.data().lecturerId === user.uid)
        .map((docSnap) => ({
          id: docSnap.id,
          moduleCode: docSnap.data().moduleCode as string,
          moduleName: (docSnap.data().moduleName as string) || ""
        }));
      setModules(data);
      if (data.length > 0 && !moduleId) {
        setModuleId(data[0].id);
      }
    });
    return () => unsubscribe();
  }, [user, moduleId]);

  // watch for any active session owned by this lecturer so we can return to it
  useEffect(() => {
    if (!user) return;
    const sessionsRef = collection(db, "sessions");
    // fetch the most recent sessions for this lecturer and filter client-side
    const q = query(sessionsRef, where("lecturerId", "==", user.uid), orderBy("createdAt", "desc"), limit(5));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs;
      let found: string | null = null;
      for (const d of docs) {
        const data = d.data() as any;
        const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ? new Date(data.expiresAt) : null;
        const stillActive = data.isActive && (!expiresAt || expiresAt.getTime() > Date.now());
        if (stillActive) { found = d.id; break; }
      }
      setActiveSessionId(found);
    });
    return () => unsub();
  }, [user]);

  const handleReturnToLive = async (id: string | null) => {
    if (!id) return;
    try {
      const ref = doc(db, "sessions", id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setActiveSessionId(null);
        setError("Active session not found");
        return;
      }
      const data = snap.data() as any;
      const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : data.expiresAt ? new Date(data.expiresAt) : null;
      const stillActive = data.isActive && (!expiresAt || expiresAt.getTime() > Date.now());
      if (!stillActive) {
        setActiveSessionId(null);
        setError("No active session found");
        return;
      }
      navigate(`/sessions/${id}/live`);
    } catch (err: any) {
      setError(err.message || "Failed to fetch session");
    }
  };

  const moduleMap = useMemo(() => {
    const map: Record<string, ModuleOption> = {};
    modules.forEach((mod) => {
      map[mod.id] = mod;
    });
    return map;
  }, [modules]);

  const toggleField = (field: string) => {
    setRequiredFields((prev) => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!moduleId) {
      setError("Select a module");
      return;
    }
    const module = moduleMap[moduleId];
    if (!module) return;

    setLoading(true);
    setError(null);

    // open a blank window synchronously so popup blockers allow display opening
    let displayWindow: Window | null = null;
    try {
      displayWindow = window.open("", "_blank");
    } catch (e) {
      displayWindow = null;
    }

    try {
      const callable = httpsCallable(functions, "createSession");
      const result = (await callable({
        moduleId,
        moduleCode: module.moduleCode,
        title,
        windowSeconds,
        requiredFields,
        requireClassCode,
        classCodeRotationSeconds: requireClassCode ? classCodeRotationSeconds : undefined
      })) as any;

      const sessionId = result?.data?.sessionId;
      if (sessionId) {
        const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
        if (displayWindow) {
          try { displayWindow.location.href = displayUrl; } catch { window.open(displayUrl, "_blank", "noopener,noreferrer"); }
        } else {
          window.open(displayUrl, "_blank", "noopener,noreferrer");
        }

        showToast({ message: "Session started", variant: "success" });
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
      const msg = err?.details?.message || err?.message || "Failed to create session";
      setError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Start attendance session"
        description="Define session details, required student information, and anti-sharing measures."
      />

      <form className="space-y-8" onSubmit={handleSubmit}>
        {activeSessionId && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 sm:p-4 text-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex-shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full bg-amber-100 text-amber-700">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-amber-800 truncate">There is an active session in progress</div>
                  <div className="text-xs text-amber-700 truncate">Return to the live session to manage attendance and view submissions.</div>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleReturnToLive(activeSessionId)}
                  className="rounded-md bg-amber-600 text-white px-3 py-2 text-sm hover:bg-amber-700"
                >
                  Return to live session
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSessionId(null)}
                  className="rounded-md border border-amber-300 px-3 py-2 text-sm text-amber-700 bg-amber-50 hover:bg-amber-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
        <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Session information</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-1">
              <label className="mb-1 block text-sm font-medium text-text-muted">Module</label>
              <select
                className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none text-text-primary"
                value={moduleId}
                onChange={(event) => setModuleId(event.target.value)}
                required
              >
                <option value="" disabled className="text-text-muted">
                  Select module
                </option>
                {modules.map((mod) => (
                  <option value={mod.id} key={mod.id} className="text-text-primary">
                    {mod.moduleCode}{mod.moduleName ? ` — ${mod.moduleName}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-1">
              <label className="mb-1 block text-sm font-medium text-text-muted">Session title</label>
              <input
                className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base sm:text-sm focus:border-brand-primary focus:outline-none"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Week 2 lecture"
              />
            </div>
            <div className="md:col-span-2">
              <p className="mb-2 text-sm font-medium text-text-muted">QR expiry window</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {windowOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${windowSeconds === option.value ? "border-brand-primary bg-surfaceAlt" : "border-stroke-subtle hover:border-brand-primary/60"}`}
                  >
                    <input
                      type="radio"
                      name="window"
                      value={option.value}
                      checked={windowSeconds === option.value}
                      onChange={() => setWindowSeconds(option.value)}
                    />
                    <span className="text-text-primary">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Student fields</h2>
          <p className="mt-2 text-sm text-text-muted">Select the data students must provide when submitting attendance.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {['name','surname','initials','email','group'].map((field) => (
              <label key={field} className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={!!requiredFields[field]}
                  onChange={() => toggleField(field)}
                />
                <span className="capitalize">{field}</span>
              </label>
            ))}
          </div>
          <p className="mt-3 text-xs text-text-muted">Student number is always required and validated by the system.</p>
        </section>

        <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Anti-cheat settings</h2>
            <div className="mt-4 flex flex-col gap-3 rounded-md border border-stroke-subtle bg-surfaceAlt px-4 py-3">
            <div>
              <p className="text-sm font-medium text-text-primary">In-class code</p>
              <p className="text-xs text-text-muted">Require a 4-digit code announced in the lecture room.</p>
            </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input type="checkbox" checked={requireClassCode} onChange={() => setRequireClassCode((prev) => !prev)} />
                  Enable
                </label>
                {requireClassCode && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-text-muted">Rotation</label>
                    <select className="rounded-md border px-2 py-1 text-sm" value={classCodeRotationSeconds} onChange={(e) => setClassCodeRotationSeconds(Number(e.target.value))}>
                      <option value={30}>30s</option>
                      <option value={60}>60s</option>
                    </select>
                  </div>
                )}
              </div>
          </div>
        </section>

        {error && <p className="text-sm text-accent-error">{error}</p>}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-full sm:w-auto rounded-md border border-stroke-subtle px-4 py-3 text-base font-medium text-text-muted transition hover:bg-surfaceAlt"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="w-full sm:w-auto rounded-lg bg-brand-primary px-6 py-3 text-base font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-stroke-strong"
            disabled={loading}
          >
            {loading ? "Starting..." : "Start session"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default CreateSession;
