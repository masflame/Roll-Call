// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, orderBy, addDoc, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "../../firebase";
import PageHeader from "../../components/PageHeader";
import { useToast } from "../../components/ToastProvider";

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
      setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [user]);

  const moduleMap = useMemo(() => {
    const m = {} as any;
    modules.forEach((mod: any) => (m[mod.id] = mod));
    return m;
  }, [modules]);

  const toggleField = (field: string) => setRequiredFields((p) => ({ ...p, [field]: !p[field] }));

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
      <PageHeader title="Schedules" description="Create and manage scheduled attendance sessions." noBackground />

        <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
          <form className="rounded-md border border-stroke-subtle bg-white p-4 sm:p-6 shadow-sm text-gray-900 w-full max-w-full overflow-hidden box-border" onSubmit={handleCreate}>
          <h3 className="text-sm font-semibold text-gray-900">New schedule</h3>
              <div className="mt-4 grid gap-3">
                <select value={moduleId} onChange={(e) => setModuleId(e.target.value)} className="w-full rounded-md border px-4 py-2 sm:py-3 text-base text-gray-900">
              <option value="">Select module</option>
              {modules.map((m: any) => <option key={m.id} value={m.id}>{m.moduleCode}{m.moduleName ? ` — ${m.moduleName}` : ""}</option>)}
            </select>
                <input className="w-full rounded-md border px-4 py-2 sm:py-3 text-base text-gray-900" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
                <input type="datetime-local" className="w-full rounded-md border px-4 py-2 sm:py-3 text-base text-gray-900" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full rounded-md border px-4 py-2 sm:py-3 text-base text-gray-900">
              <option value="none">No recurrence</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
                <input className="w-full rounded-md border px-4 py-2 sm:py-3 text-base text-gray-900" placeholder="Instructors (comma separated)" value={instructors} onChange={(e) => setInstructors(e.target.value)} />
            <div className="grid gap-2 sm:grid-cols-2">
                  {windowOptions.map((opt) => (
                    <label key={opt.value} className={`flex items-center gap-2 rounded-md border px-3 py-2 ${windowSeconds === opt.value ? 'border-brand-primary bg-surfaceAlt' : 'border-stroke-subtle'}`}>
                      <input type="radio" name="window" checked={windowSeconds === opt.value} onChange={() => setWindowSeconds(opt.value)} /> <span className="text-gray-900 text-sm">{opt.label}</span>
                    </label>
                  ))}
            </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requireClassCode} onChange={() => setRequireClassCode((p) => !p)} /> <span className="ml-1">Require class code</span></label>
                  <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={concurrent} onChange={() => setConcurrent((p) => !p)} /> <span className="ml-1">Allow concurrent sessions</span></label>
                </div>
            <div className="grid gap-2 sm:grid-cols-2">
                  {['name','surname','initials','email','group'].map((k) => (
                    <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!requiredFields[k]} onChange={() => toggleField(k)} /> <span className="text-gray-900 ml-1">{k}</span></label>
                  ))}
            </div>
                <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
                  <button type="button" onClick={() => { setTitle(''); setRecurrence('none'); setInstructors(''); setConcurrent(false); setEditingId(null); }} className="rounded-md border px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base w-full sm:w-auto">Reset</button>
                  <button type="submit" disabled={loading} className="rounded-lg bg-gray-900 text-white px-3 py-2 sm:px-4 sm:py-3 text-sm sm:text-base w-full sm:w-auto">{editingId ? 'Update' : 'Save'}</button>
                </div>
          </div>
        </form>

              <div className="space-y-2 overflow-x-auto">
              {schedules.map((s: any) => (
                <div key={s.id} className="w-full box-border rounded-md border bg-white p-3 sm:p-4 shadow-sm flex flex-col sm:flex-row sm:items-start justify-between text-gray-900">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{s.title || (moduleMap[s.moduleId]?.moduleCode || 'Untitled')}</div>
                    <div className="text-xs text-gray-600">{s.scheduledAt?.toDate ? new Date(s.scheduledAt.toDate()).toLocaleString() : s.scheduledAt ? new Date(s.scheduledAt).toLocaleString() : '—'}</div>
                    <div className="text-xs text-gray-600 mt-1">Status: {s.status || 'queued'}</div>
                    <div className="text-xs text-gray-600 mt-1">Recurrence: {s.recurrence || 'none'}</div>
                    <div className="text-xs text-gray-600 mt-1">Instructors: {(s.instructors || []).join(', ') || '—'}</div>
                    <div className="text-xs text-gray-600 mt-1">Concurrent sessions: {s.concurrent ? 'Yes' : 'No'}</div>
              </div>
                  <div className="mt-3 sm:mt-0 flex items-center sm:flex-col sm:items-end gap-2">
                    <div className="flex gap-2">
                      <button onClick={() => handleStart(s)} disabled={s.status === 'started' || loading} className="rounded-md bg-brand-primary text-white px-3 py-1 text-sm">Start</button>
                      <button onClick={() => handleEdit(s)} className="rounded-md border px-3 py-1 text-sm text-gray-700">Edit</button>
                    </div>
                    <button onClick={() => handleDelete(s.id)} className="rounded-md border px-3 py-1 text-sm text-gray-700">Delete</button>
                  </div>
            </div>
          ))}
            </div>
      </div>
    </div>
  );
}

export default Schedules;
