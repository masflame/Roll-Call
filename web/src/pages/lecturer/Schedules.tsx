// @ts-nocheck
import { useEffect, useMemo, useState, useRef } from "react";
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "../../firebase";
// PageHeader removed from page layout
import { useToast } from "../../components/ToastProvider";
import ActionSelect from "../../components/ui/Selects";

function formatDateTimeLocal(d?: Date | null) {
  if (!d) return "";
  const tzOffset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

const windowOptions = [
  { label: "30 seconds", value: 30 },
  { label: "60 seconds", value: 60 },
  { label: "2 minutes", value: 120 },
  { label: "5 minutes", value: 300 }
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Schedules() {
  const user = auth.currentUser;
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [modules, setModules] = useState([]);
  const [schedules, setSchedules] = useState([]);

  const [moduleId, setModuleId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState<string>(formatDateTimeLocal(new Date()));
  const [windowSeconds, setWindowSeconds] = useState(60);
  const [requiredFields, setRequiredFields] = useState({ name: false, surname: false, initials: false, email: false, group: false });
  const [requireClassCode, setRequireClassCode] = useState(false);
  const [recurrence, setRecurrence] = useState<string>("none");
  const [instructors, setInstructors] = useState<string>("");
  const [concurrent, setConcurrent] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>({});
  const visibleTimers = useRef<number[]>([]);

  useEffect(() => {
    if (!user) return;
    const modulesRef = collection(db, "modules");
    const unsub = onSnapshot(query(modulesRef), (snap) => {
      const data = snap.docs
        .filter((d) => d.data().lecturerId === user.uid)
        .map((d) => ({ id: d.id, ...d.data() }));
      setModules(data);
      if (data.length > 0 && !moduleId) setModuleId(data[0].id);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const ref = collection(db, "schedules");
    const q = query(ref, where("lecturerId", "==", user.uid), orderBy("scheduledAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setSchedules(items);
      // start staggered enter animations
      // clear any previous timers
      visibleTimers.current.forEach((t) => clearTimeout(t));
      visibleTimers.current = [];
      setVisibleMap({});
      items.forEach((it: any, idx: number) => {
        const t = window.setTimeout(() => {
          setVisibleMap((p) => ({ ...p, [it.id]: true }));
        }, idx * 70);
        visibleTimers.current.push(t as unknown as number);
      });
    });
    return () => unsub();
  }, [user]);

  const moduleMap = useMemo(() => {
    const m = {} as any;
    modules.forEach((mod: any) => (m[mod.id] = mod));
    return m;
  }, [modules]);

  const toggleField = (field: string) => setRequiredFields((p) => ({ ...p, [field]: !p[field] }));

  function Segmented({ value, options, onChange }: { value: number; options: { label: string; value: number }[]; onChange: (v: number) => void; }) {
    return (
      <div className="inline-flex rounded-full border border-stroke-subtle bg-surface p-1">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-semibold transition",
                active ? "bg-brand-soft text-brand-primary" : "text-text-muted hover:bg-surfaceAlt hover:text-text-primary"
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }

  const handleCreate = async (e?: any) => {
    e?.preventDefault();
    if (!user) return showToast({ message: "Not signed in", variant: "error" });
    if (!moduleId) return showToast({ message: "Select module", variant: "error" });
    setLoading(true);
    try {
      const payload: any = {
        lecturerId: user.uid,
        moduleId,
        title,
        scheduledAt: new Date(scheduledAt),
        windowSeconds,
        requiredFields,
        requireClassCode,
        recurrence: recurrence === 'none' ? null : recurrence,
        instructors: instructors ? instructors.split(",").map((s) => s.trim()).filter(Boolean) : [],
        concurrent: concurrent || false,
        status: "queued",
        createdAt: new Date()
      };
      if (editingId) {
        await updateDoc(doc(db, "schedules", editingId), payload);
        setEditingId(null);
      } else {
        await addDoc(collection(db, "schedules"), payload);
      }
      setTitle("");
      setRecurrence("none");
      setInstructors("");
      setConcurrent(false);
      showToast({ message: "Schedule saved", variant: "success" });
    } catch (err: any) {
      showToast({ message: err?.message || "Failed to create schedule", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleStart = async (sched: any) => {
    if (!user) return;
    setLoading(true);
    try {
      const module = moduleMap[sched.moduleId];
      let moduleCode = module?.moduleCode || "";
      if (!moduleCode && sched.moduleId) {
        try {
          const modSnap = await getDoc(doc(db, "modules", sched.moduleId));
          if (modSnap.exists()) moduleCode = (modSnap.data() as any)?.moduleCode || "";
        } catch (err) {
          // ignore; validation server-side will error if still missing
        }
      }
      // open a blank window synchronously so popup blockers allow display opening
      let displayWindow: Window | null = null;
      try { displayWindow = window.open("", "_blank"); } catch { displayWindow = null; }

      const callable = httpsCallable(functions, "createSession");
      const payload: any = {
        moduleId: sched.moduleId,
        moduleCode,
        title: sched.title || "",
        windowSeconds: sched.windowSeconds || 60,
        requiredFields: sched.requiredFields || {},
        requireClassCode: sched.requireClassCode || false
      };
      const result = (await callable(payload)) as any;
      const sessionId = result?.data?.sessionId;
      if (sessionId) {
        await updateDoc(doc(db, "schedules", sched.id), { status: "started", startedAt: new Date(), sessionId });

        const displayUrl = `${window.location.origin}/sessions/${sessionId}/display`;
        if (displayWindow) {
          try { displayWindow.location.href = displayUrl; } catch { window.open(displayUrl, "_blank", "noopener,noreferrer"); }
        } else {
          window.open(displayUrl, "_blank", "noopener,noreferrer");
        }

        showToast({ message: "Session started from schedule", variant: "success" });
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
      showToast({ message: err?.message || "Failed to start session", variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (schedId: string) => {
    try {
      await deleteDoc(doc(db, "schedules", schedId));
      showToast({ message: "Schedule removed", variant: "success" });
    } catch (err: any) {
      showToast({ message: err?.message || "Failed to delete schedule", variant: "error" });
    }
  };

  const handleEdit = (s: any) => {
    setEditingId(s.id);
    setModuleId(s.moduleId || "");
    setTitle(s.title || "");
    setScheduledAt(s.scheduledAt?.toDate ? formatDateTimeLocal(new Date(s.scheduledAt.toDate())) : s.scheduledAt ? formatDateTimeLocal(new Date(s.scheduledAt)) : formatDateTimeLocal(new Date()));
    setWindowSeconds(s.windowSeconds || 60);
    setRequiredFields(s.requiredFields || { name: false, surname: false, initials: false, email: false, group: false });
    setRequireClassCode(!!s.requireClassCode);
    setRecurrence(s.recurrence || "none");
    setInstructors((s.instructors || []).join(", "));
    setConcurrent(!!s.concurrent);
  };

    return (
      <div className="space-y-6">

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
          <form className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle text-text-primary w-full max-w-full overflow-hidden box-border" onSubmit={handleCreate}>
            <h3 className="text-sm font-semibold text-text-primary">New schedule</h3>
            <div className="mt-4 grid gap-4">
                  <ActionSelect
                    value={moduleId}
                    onChange={(v) => setModuleId(v)}
                    options={modules.map((m: any) => ({ label: `${m.moduleCode}${m.moduleName ? ` — ${m.moduleName}` : ""}`, value: m.id }))}
                    includeAll={false}
                  />
                    <input className="w-full rounded-lg border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
                    <input type="datetime-local" className="w-full rounded-lg border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                    <ActionSelect
                      value={recurrence}
                      onChange={(v) => setRecurrence(v)}
                      options={[{ label: 'No recurrence', value: 'none' }, { label: 'Daily', value: 'daily' }, { label: 'Weekly', value: 'weekly' }]}
                      includeAll={false}
                    />
                    <input className="w-full rounded-lg border border-stroke-subtle bg-surface px-4 py-3 text-sm text-text-primary outline-none transition focus:border-brand-primary" placeholder="Instructors (comma separated)" value={instructors} onChange={(e) => setInstructors(e.target.value)} />
            <div className="mt-3">
              <Segmented
                value={windowSeconds}
                options={windowOptions.map((o) => ({ label: o.label === '30 seconds' ? '30s' : o.label === '60 seconds' ? '60s' : o.label === '2 minutes' ? '2m' : '5m', value: o.value }))}
                onChange={setWindowSeconds}
              />
            </div>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={() => setRequireClassCode((p) => !p)} className={cx(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    requireClassCode ? "border-brand-primary/30 bg-brand-soft text-brand-primary" : "border-stroke-subtle bg-surface text-text-primary hover:bg-surfaceAlt"
                  )}>
                    Require class code
                  </button>

                  <button type="button" onClick={() => setConcurrent((p) => !p)} className={cx(
                    "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold transition",
                    concurrent ? "border-brand-primary/30 bg-brand-soft text-brand-primary" : "border-stroke-subtle bg-surface text-text-primary hover:bg-surfaceAlt"
                  )}>
                    Allow concurrent sessions
                  </button>
                </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {['name','surname','initials','email','group'].map((k) => {
                    const enabled = !!requiredFields[k];
                    return (
                      <button key={k} type="button" onClick={() => toggleField(k)} className={cx(
                        "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                        enabled ? "border-brand-primary/30 bg-brand-soft" : "border-stroke-subtle bg-surface hover:bg-surfaceAlt"
                      )}>
                        <div>
                          <div className="text-sm font-semibold text-text-primary capitalize">{k}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {enabled ? <span className="text-xs text-brand-primary">Required</span> : <span className="text-xs text-text-muted">Optional</span>}
                        </div>
                      </button>
                    );
                  })}
            </div>
                <div className="flex flex-col sm:flex-row sm:justify-end gap-3">
                  <button type="button" onClick={() => { setTitle(''); setRecurrence('none'); setInstructors(''); setConcurrent(false); setEditingId(null); }} className="inline-flex w-full items-center justify-center rounded-md border border-stroke-subtle bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt sm:w-auto">Reset</button>
                  <button type="submit" disabled={loading} className="inline-flex w-full items-center justify-center rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-stroke-strong sm:w-auto">{editingId ? 'Update' : 'Save'}</button>
                </div>
          </div>
        </form>

              <div className="space-y-3 overflow-x-hidden">
                {schedules.length === 0 && (
                  <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 text-sm text-text-muted">
                    No schedules yet.
                  </div>
                )}

                {schedules.map((s: any) => {
                  const moduleCode = moduleMap[s.moduleId]?.moduleCode || "";
                  const moduleName = moduleMap[s.moduleId]?.moduleName || "";
                  const primaryTitle = s.title || moduleCode || "Untitled schedule";
                  const subtitle =
                    moduleCode && moduleName ? `${moduleCode} — ${moduleName}` : moduleCode || moduleName || "";

                  const when = s.scheduledAt?.toDate
                    ? new Date(s.scheduledAt.toDate()).toLocaleString()
                    : s.scheduledAt
                      ? new Date(s.scheduledAt).toLocaleString()
                      : "—";

                  const status = (s.status || "queued").toLowerCase();
                  const isStarted = status === "started";

                  const statusPill =
                    status === "queued"
                      ? "bg-surfaceAlt text-text-muted border-stroke-subtle"
                      : status === "started"
                        ? "bg-accent-success/10 text-accent-success border-accent-success/20"
                        : "bg-surfaceAlt text-text-muted border-stroke-subtle";

                  return (
                    <div
                      key={s.id}
                      className={cx(
                        "w-full box-border rounded-2xl border border-stroke-subtle bg-surface",
                        "p-4 sm:p-4",
                        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
                        visibleMap[s.id] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
                        "transition-all duration-300 ease-out",
                        "hover:bg-surfaceAlt/40 hover:border-stroke-strong"
                      )}
                    >
                      {/* Left: content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="min-w-0 truncate text-sm font-semibold text-text-primary">
                            {primaryTitle}
                          </h4>
                          <span className={cx("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", statusPill)}>
                            {status}
                          </span>
                          {s.concurrent && (
                            <span className="inline-flex items-center rounded-full border border-brand-secondary/20 bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-secondary">
                              Concurrent
                            </span>
                          )}
                          {s.requireClassCode && (
                            <span className="inline-flex items-center rounded-full border border-brand-primary/20 bg-brand-soft px-2 py-0.5 text-xs font-semibold text-brand-primary">
                              Class code
                            </span>
                          )}
                        </div>

                        {subtitle && (
                          <div className="mt-1 text-xs text-text-muted truncate">{subtitle}</div>
                        )}

                        <div className="mt-2 text-xs text-text-muted">
                          <span className="font-medium text-text-primary/80">Scheduled:</span> {when}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
                          <div>
                            <span className="font-medium text-text-primary/80">Recurrence:</span>{" "}
                            {s.recurrence || "none"}
                          </div>
                          <div className="truncate">
                            <span className="font-medium text-text-primary/80">Instructors:</span>{" "}
                            {(s.instructors || []).join(", ") || "—"}
                          </div>
                          <div>
                            <span className="font-medium text-text-primary/80">Window:</span>{" "}
                            {s.windowSeconds ? `${s.windowSeconds}s` : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Right: actions */}
                      <div className="flex flex-row flex-wrap items-center gap-2 sm:flex-col sm:items-end sm:gap-2 sm:pt-0">
                        <div className="flex w-full flex-row gap-2 sm:w-auto sm:justify-end">
                          <button
                            onClick={() => handleStart(s)}
                            disabled={isStarted || loading}
                            className={cx(
                              "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-semibold transition",
                              isStarted || loading
                                ? "bg-stroke-strong text-text-onBrand/70 cursor-not-allowed"
                                : "bg-brand-primary text-text-onBrand hover:bg-brand-primary/90"
                            )}
                          >
                            {isStarted ? "Started" : "Start"}
                          </button>

                          <button
                            onClick={() => handleEdit(s)}
                            className="inline-flex items-center justify-center rounded-md border border-stroke-subtle bg-surface px-3 py-1.5 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                          >
                            Edit
                          </button>
                        </div>

                        <button
                          onClick={() => handleDelete(s.id)}
                          className="inline-flex items-center justify-center rounded-md border border-stroke-subtle bg-surface px-3 py-1.5 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
      </div>
    </div>
  );
}

export default Schedules;
