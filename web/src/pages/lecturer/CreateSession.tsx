// @ts-nocheck
import { FormEvent, useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  getDoc,
  doc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "../../firebase";
import { getDelegateMode } from "../../lib/delegate";
// PageHeader intentionally removed per user preference
import { PlayCircle, ShieldCheck, Info, BookOpen } from "lucide-react";
import ActionSelect from "../../components/ui/Selects";
import { useToast } from "../../components/ToastProvider";

interface ModuleOption {
  id: string;
  moduleCode: string;
  moduleName?: string;
}

interface OfferingOption {
  id: string;
  label: string;
}

interface GroupOption {
  id: string;
  label: string;
}

const windowOptions = [
  { label: "30s", value: 30 },
  { label: "60s", value: 60 },
  { label: "2m", value: 120 },
  { label: "5m", value: 300 },
];

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function Pill({ children, tone = "neutral" }: any) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
        tone === "warning"
          ? "border-accent-warning/25 bg-accent-warning/10 text-accent-warning"
          : tone === "success"
          ? "border-accent-success/25 bg-accent-success/10 text-accent-success"
          : "border-stroke-subtle bg-surfaceAlt text-text-muted"
      )}
    >
      {children}
    </span>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  subtitle,
}: {
  icon?: any;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {Icon ? (
        <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stroke-subtle bg-surfaceAlt">
          <Icon className="h-4 w-4 text-text-muted" />
        </div>
      ) : null}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-text-muted">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: number;
  options: { label: string; value: number }[];
  onChange: (v: number) => void;
}) {
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
              active
                ? "bg-brand-soft text-brand-primary"
                : "text-text-muted hover:bg-surfaceAlt hover:text-text-primary"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PrimaryButton({ children, disabled, className }: any) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={cx(
        "inline-flex w-full items-center justify-center rounded-md bg-brand-primary px-6 py-3 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90 disabled:cursor-not-allowed disabled:bg-stroke-strong sm:w-auto",
        className
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center rounded-md border border-stroke-subtle bg-surface px-5 py-3 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt sm:w-auto"
    >
      {children}
    </button>
  );
}

function Card({ children }: any) {
  return (
    <section className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
      {children}
    </section>
  );
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-accent-error/25 bg-accent-error/5 px-4 py-3 text-sm text-accent-error">
      {message}
    </div>
  );
}

function CreateSession() {
  const user = auth.currentUser;
  const delegateMode = getDelegateMode();
  const ownerOverride = delegateMode ? delegateMode.ownerUid : null;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [modules, setModules] = useState<ModuleOption[]>([]);
  const [moduleId, setModuleId] = useState("");
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  // `undefined` = not initialised (auto-select first), "" = explicit Default/none
  const [offeringId, setOfferingId] = useState<string | undefined>(undefined);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [groupId, setGroupId] = useState<string | undefined>(undefined);

  const [title, setTitle] = useState("");
  const [windowSeconds, setWindowSeconds] = useState(60);

  const [requiredFields, setRequiredFields] = useState<Record<string, boolean>>({
    name: false,
    surname: false,
    initials: false,
    email: false,
    group: false,
  });

  const [requireClassCode, setRequireClassCode] = useState(false);
  const [classCodeRotationSeconds, setClassCodeRotationSeconds] = useState<number>(30);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Load modules (for this lecturer or delegated owner)
  useEffect(() => {
    if (!user && !ownerOverride) return;

    const modulesRef = collection(db, "modules");
    const q = ownerOverride ? query(modulesRef, where("lecturerId", "==", ownerOverride)) : query(modulesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .filter((docSnap) => {
          if (ownerOverride) return true;
          return (docSnap.data().lecturerId === user.uid);
        })
        .map((docSnap) => ({
          id: docSnap.id,
          moduleCode: docSnap.data().moduleCode as string,
          moduleName: (docSnap.data().moduleName as string) || "",
        }));

      // stable sort
      data.sort((a, b) => a.moduleCode.localeCompare(b.moduleCode));

      setModules(data);
      if (data.length > 0 && !moduleId) setModuleId(data[0].id);
    });

    return () => unsubscribe();
  }, [user, ownerOverride, moduleId]);

  // Load offerings for selected module
  useEffect(() => {
    if (!user || !moduleId) {
      setOfferings([]);
      setOfferingId(undefined);
      return;
    }

    const offeringsRef = collection(db, "offerings");
    const q = query(offeringsRef, where("moduleId", "==", moduleId));
    const unsub = onSnapshot(q, (snap) => {
      const out = snap.docs.map((d) => {
        const data = d.data() as any;
        const year = data.year || data.academicYear || "";
        const term = data.term ? ` • ${data.term}` : "";
        const prog = data.programme ? ` • ${data.programme}` : "";
        const label = `${year}${term}${prog}`.trim() || (data.title || d.id);
        return { id: d.id, label } as OfferingOption;
      });
      setOfferings(out);
      // only auto-select if offeringId is still uninitialised
      if (out.length > 0 && offeringId === undefined) setOfferingId(out[0].id);
    });

    return () => unsub();
  }, [user, moduleId, offeringId]);

  // Load groups for selected offering
  useEffect(() => {
    if (!user || offeringId === undefined || offeringId === "") {
      setGroups([]);
      // when offeringId is explicitly "" (Default/none), set groupId to "" (explicit none)
      setGroupId(offeringId === "" ? "" : undefined);
      return;
    }

    const groupsRef = collection(db, "groups");
    const q = query(groupsRef, where("offeringId", "==", offeringId));
    const unsub = onSnapshot(q, (snap) => {
      const out = snap.docs.map((d) => ({ id: d.id, label: String((d.data() as any).label || d.id) }));
      setGroups(out);
      if (out.length > 0 && groupId === undefined) setGroupId(out[0].id);
    });

    return () => unsub();
  }, [user, offeringId, groupId]);

  // Detect any active session (recent 5) for lecturer or delegated owner
  useEffect(() => {
    if (!user && !ownerOverride) return;

    const targetLecturer = ownerOverride || user.uid;
    const sessionsRef = collection(db, "sessions");
    const q = query(
      sessionsRef,
      where("lecturerId", "==", targetLecturer),
      orderBy("createdAt", "desc"),
      limit(5)
    );

    const unsub = onSnapshot(q, (snap) => {
      let found: string | null = null;
      for (const d of snap.docs) {
        const data = d.data() as any;
        const expiresAt = data.expiresAt?.toDate
          ? data.expiresAt.toDate()
          : data.expiresAt
          ? new Date(data.expiresAt)
          : null;

        const stillActive = data.isActive && (!expiresAt || expiresAt.getTime() > Date.now());
        if (stillActive) {
          found = d.id;
          break;
        }
      }
      setActiveSessionId(found);
    });

    return () => unsub();
  }, [user, ownerOverride]);

  const moduleMap = useMemo(() => {
    const map: Record<string, ModuleOption> = {};
    modules.forEach((m) => (map[m.id] = m));
    return map;
  }, [modules]);

  const toggleField = useCallback((field: string) => {
    setRequiredFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  const handleReturnToLive = useCallback(
    async (id: string | null) => {
      if (!id) return;
      try {
        const ref = doc(db, "sessions", id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setActiveSessionId(null);
          setError("Active session not found.");
          return;
        }

        const data = snap.data() as any;
        const expiresAt = data.expiresAt?.toDate
          ? data.expiresAt.toDate()
          : data.expiresAt
          ? new Date(data.expiresAt)
          : null;

        const stillActive = data.isActive && (!expiresAt || expiresAt.getTime() > Date.now());
        if (!stillActive) {
          setActiveSessionId(null);
          setError("No active session found.");
          return;
        }

        navigate(`/sessions/${id}/live`);
      } catch (err: any) {
        setError(err?.message || "Failed to fetch session.");
      }
    },
    [navigate]
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!moduleId) {
      setError("Select a module.");
      return;
    }

    const module = moduleMap[moduleId];
    if (!module) return;

    setLoading(true);
    setError(null);

    // open blank window synchronously to avoid popup blocking
    let displayWindow: Window | null = null;
    try {
      displayWindow = window.open("", "_blank");
    } catch {
      displayWindow = null;
    }

    try {
      // If delegate mode is active, call the delegated callable and pass accessId
      const callableName = delegateMode ? "createSessionAsOwner" : "createSession";
      const callable = httpsCallable(functions, callableName);
      const payload: any = {
        moduleId,
        moduleCode: module.moduleCode,
        offeringId: offeringId === "" ? undefined : offeringId || undefined,
        groupId: groupId === "" ? undefined : groupId || undefined,
        title: title?.trim() || "",
        windowSeconds,
        requiredFields,
        requireClassCode,
        classCodeRotationSeconds: requireClassCode ? classCodeRotationSeconds : undefined,
      };
      if (delegateMode) payload.accessId = delegateMode.accessId;

      const result = (await callable(payload)) as any;

      const sessionId = result?.data?.sessionId;
      if (sessionId) {
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

        showToast({ message: "Session started", variant: "success" });

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
      const msg = err?.details?.message || err?.message || "Failed to create session.";
      setError(msg);
      showToast({ message: msg, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  const selectedModuleLabel = useMemo(() => {
    const m = moduleMap[moduleId];
    if (!m) return "Select module";
    return `${m.moduleCode}${m.moduleName ? ` — ${m.moduleName}` : ""}`;
  }, [moduleId, moduleMap]);

  function InfoButton({ label }: { label: string }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          aria-label="Info"
          className="rounded-full p-1 text-xs text-text-muted hover:bg-surfaceAlt"
        >
          <Info className="h-4 w-4" />
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-64 rounded-md bg-white border border-stroke-subtle p-3 text-sm text-text-muted shadow-lg z-20">
            {label}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* PageHeader removed per user preference */}

      <form className="space-y-6" onSubmit={handleSubmit}>
        {/* Active session callout */}
        {activeSessionId ? (
          <div className="rounded-2xl border border-accent-warning/25 bg-accent-warning/10 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3 min-w-0">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-warning/15 text-accent-warning">
                  <PlayCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text-primary truncate">
                    An active session is running
                  </div>
                  <div className="mt-1 text-xs text-text-muted truncate">
                    Return to the live panel to manage attendance and renew QR windows.
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleReturnToLive(activeSessionId)}
                  className="inline-flex items-center justify-center rounded-full bg-accent-warning px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
                >
                  Return to live
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSessionId(null)}
                  className="inline-flex items-center justify-center rounded-full border border-accent-warning/30 bg-transparent px-4 py-2 text-sm font-semibold text-accent-warning transition hover:bg-accent-warning/10"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Session info */}
        <Card>
          {/* <div className="flex items-center justify-between gap-4">
            <SectionTitle icon={BookOpen} title="Session info" subtitle="Pick the module, add an optional title, and set the QR window." />
            <Pill>QR window</Pill>
          </div> */}

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-text-primary">
                Module
              </label>
              <ActionSelect
                value={moduleId || ""}
                onChange={(v) => setModuleId(v)}
                options={modules.map((m) => ({ label: `${m.moduleCode}${m.moduleName ? ` — ${m.moduleName}` : ""}`, value: m.id }))}
                includeAll={false}
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-primary">Offering (optional)</label>
              <ActionSelect
                value={offeringId ?? ""}
                onChange={(v) => setOfferingId(v === 'all' ? "" : v)}
                options={offerings.map((o) => ({ label: o.label, value: o.id }))}
                allLabel="Default / none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-primary">Group (optional)</label>
              <ActionSelect
                value={groupId ?? ""}
                onChange={(v) => setGroupId(v === 'all' ? "" : v)}
                options={groups.map((g) => ({ label: g.label, value: g.id }))}
                allLabel="Default / none"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-text-primary">
                Session title (optional)
              </label>
              <input
                className="w-full rounded-lg border border-stroke-subtle bg-surface px-3 py-1.5 text-sm text-text-primary outline-none transition focus:border-brand-primary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Week 2 lecture"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-semibold text-text-primary">
                  QR expiry window
                </label>
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <InfoButton label="Students must submit before expiry." />
                </div>
              </div>

              <div className="mt-3">
                <Segmented
                  value={windowSeconds}
                  options={windowOptions}
                  onChange={setWindowSeconds}
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Student fields */}
        <Card>
          <SectionTitle
            title="Student fields"
            subtitle="Choose what additional details students must provide. Student number is always required."
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {["name", "surname", "initials", "email", "group"].map((field) => {
              const enabled = !!requiredFields[field];
              return (
                <button
                  key={field}
                  type="button"
                  onClick={() => toggleField(field)}
                  className={cx(
                    "flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition",
                    enabled
                      ? "border-brand-primary/30 bg-brand-soft"
                      : "border-stroke-subtle bg-surface hover:bg-surfaceAlt"
                  )}
                >
                  <div>
                    <div className="text-sm font-semibold text-text-primary capitalize">
                      {field}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      {enabled ? "Required" : "Optional"}
                    </div>
                  </div>
                  <div
                    className={cx(
                      "h-5 w-9 rounded-full border p-0.5 transition",
                      enabled
                        ? "border-brand-primary bg-brand-primary/15"
                        : "border-stroke-subtle bg-surfaceAlt"
                    )}
                  >
                    <div
                      className={cx(
                        "h-4 w-4 rounded-full transition",
                        enabled ? "translate-x-4 bg-brand-primary" : "translate-x-0 bg-stroke-strong"
                      )}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 text-xs text-text-muted">
            Tip: Keep the form short for faster check-ins.
          </div>
        </Card>

        {/* Anti-cheat */}
        <Card>
          <div className="flex items-center justify-between gap-4">
            <SectionTitle
              icon={ShieldCheck}
              title="Anti-sharing"
              subtitle="Optionally require a short in-class code alongside the QR."
            />
            <Pill tone={requireClassCode ? "success" : "neutral"}>
              {requireClassCode ? "Enabled" : "Off"}
            </Pill>
          </div>

          <div className="mt-4 rounded-2xl border border-stroke-subtle bg-surfaceAlt p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">In-class code</div>
                <div className="mt-1 text-xs text-text-muted">
                  Students must enter a 4-digit code you announce in the lecture room.
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setRequireClassCode((p) => !p)}
                  className={cx(
                    "rounded-full border px-4 py-2 text-sm font-semibold transition",
                    requireClassCode
                      ? "border-brand-primary/30 bg-brand-soft text-brand-primary"
                      : "border-stroke-subtle bg-surface text-text-muted hover:bg-surfaceAlt"
                  )}
                >
                  {requireClassCode ? "Disable" : "Enable"}
                </button>

                {requireClassCode ? (
                  <label className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-muted">Rotate</span>
                    <div className="w-28">
                      <ActionSelect
                        value={String(classCodeRotationSeconds)}
                        onChange={(v) => setClassCodeRotationSeconds(Number(v))}
                        options={[{ label: '30s', value: '30' }, { label: '60s', value: '60' }]}
                        includeAll={false}
                      />
                    </div>
                  </label>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        {error ? <InlineError message={error} /> : null}

        {/* Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <GhostButton onClick={() => navigate(-1)}>Cancel</GhostButton>
          <PrimaryButton disabled={loading}>
            {loading ? "Starting…" : "Start session"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

export default CreateSession;