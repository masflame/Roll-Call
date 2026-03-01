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

              <div className="space-y-3 overflow-x-auto">
                {schedules.map((s: any, idx: number) => (
                    <div
                      key={s.id}
                      className={cx(
                        "w-full box-border rounded-2xl border bg-surface p-4 flex flex-col sm:flex-row sm:items-start justify-between text-text-primary",
                        // remove heavy shadow between stacked cards; keep subtle hover
                        "shadow-none",
                        // animate in
                        visibleMap[s.id] ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3",
                        "transition-all duration-300 ease-out hover:shadow-md"
                      )}
                    >
                  <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-primary">{s.title || (moduleMap[s.moduleId]?.moduleCode || 'Untitled')}</div>
                      <div className="text-xs text-text-muted">{s.scheduledAt?.toDate ? new Date(s.scheduledAt.toDate()).toLocaleString() : s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'}</div>
                      <div className="text-xs text-text-muted mt-1">Status: {s.status || 'queued'}</div>
                      <div className="text-xs text-text-muted mt-1">Recurrence: {s.recurrence || 'none'}</div>
                      <div className="text-xs text-text-muted mt-1">Instructors: {(s.instructors || []).join(', ') || '—'}</div>
                      <div className="text-xs text-text-muted mt-1">Concurrent sessions: {s.concurrent ? 'Yes' : 'No'}</div>
              </div>
                    <div className="mt-3 sm:mt-0 flex items-center sm:flex-col sm:items-end gap-3">
                    <div className="flex gap-2">
                        <button onClick={() => handleStart(s)} disabled={s.status === 'started' || loading} className="rounded-md bg-brand-primary text-white px-3 py-1 text-sm">Start</button>
                        <button onClick={() => handleEdit(s)} className="rounded-md border border-stroke-subtle px-3 py-1 text-sm font-semibold text-text-primary hover:bg-surfaceAlt">Edit</button>
                    </div>
                      <button onClick={() => handleDelete(s.id)} className="rounded-md border border-stroke-subtle px-3 py-1 text-sm font-semibold text-text-primary hover:bg-surfaceAlt">Delete</button>
                  </div>
            </div>
          ))}
            </div>
      </div>
    </div>
  );
}

export default Schedules;
