
// @ts-nocheck
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import * as ModuleAnalyticsModule from "../../components/ModuleAnalyticsView";
const ModuleAnalyticsView = (ModuleAnalyticsModule && (ModuleAnalyticsModule.default || ModuleAnalyticsModule.ModuleAnalyticsView)) || (function MissingModuleView() { return <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">Module analytics component unavailable.</div>; });
import { Pill, PrimaryButton, SecondaryButton } from "../../components/ui";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// Using shared UI components (Pill, PrimaryButton, SecondaryButton)

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-xl border border-stroke-subtle bg-surface px-3 py-3">
      <div className="h-4 w-2/3 rounded bg-surfaceAlt" />
      <div className="mt-2 h-3 w-1/2 rounded bg-surfaceAlt" />
    </div>
  );
}

export default function Analytics() {
  const [modules, setModules] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadingModules, setLoadingModules] = useState(true);

  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    setLoadingModules(true);
    try {
      const snap = await getDocs(collection(db, "moduleStats"));
      const items: any[] = [];
      snap.forEach((d) => items.push({ id: d.id, ...d.data() }));

      // Sort by “most activity” then name
      items.sort((a, b) => {
        const as = Number(a.sessionsCount || 0);
        const bs = Number(b.sessionsCount || 0);
        if (bs !== as) return bs - as;
        const an = String(a.moduleCode || a.moduleTitle || a.moduleId || a.id || "");
        const bn = String(b.moduleCode || b.moduleTitle || b.moduleId || b.id || "");
        return an.localeCompare(bn);
      });

      setModules(items);
      if (items.length && !selected) setSelected(items[0].id);
    } finally {
      setLoadingModules(false);
    }
  }, [selected]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadModules();
    })();
    return () => {
      mounted = false;
    };
  }, [loadModules]);

  const selectedMeta = useMemo(() => {
    if (!selected) return null;
    return modules.find((m) => m.id === selected) || null;
  }, [modules, selected]);

  const handleRecompute = useCallback(async () => {
    setRecomputing(true);
    setRecomputeMessage(null);
    try {
      const callable = httpsCallable(functions, "recomputeModuleStatsNow");
      const res: any = await callable({ days: 90 });
      setRecomputeMessage(
        res?.data?.result
          ? `Recomputed ${res.data.result.modulesProcessed} modules`
          : "Recompute completed"
      );
      await loadModules();
    } catch (err: any) {
      setRecomputeMessage(err?.message || "Recompute failed");
    } finally {
      setRecomputing(false);
    }
  }, [loadModules]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="w-1.5 h-8 rounded bg-brand-primary/90" />
            <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
              Analytics
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              Attendance insights
            </h1>
            <p className="max-w-2xl text-sm text-text-muted">
              Trends, heatmaps, completion curves, and integrity signals—organised per module.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={handleRecompute} disabled={recomputing}>
              {recomputing ? "Recomputing…" : "Recompute (90 days)"}
            </PrimaryButton>
            {recomputeMessage ? <Pill>{recomputeMessage}</Pill> : null}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Left rail */}
        <aside className="rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Modules</h2>
            <Pill tone={modules.length ? "success" : "neutral"}>{modules.length}</Pill>
          </div>

          <div className="mt-3 space-y-2">
            {loadingModules ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : modules.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stroke-subtle bg-surfaceAlt p-4 text-sm text-text-muted">
                No module stats yet. Run a session or trigger a recompute.
              </div>
            ) : (
              modules.map((m) => {
                const label =
                  m.moduleCode || m.moduleTitle || m.moduleId || m.id || "Module";
                const sub = m.moduleTitle && m.moduleCode ? m.moduleTitle : null;
                const avg = Math.round((Number(m.avgAttendance || 0) * 100)) / 100;
                const active = selected === m.id;

                return (
                  <button
                    key={m.id}
                    onClick={() => setSelected(m.id)}
                    className={cx(
                      "w-full rounded-xl border px-3 py-3 text-left transition",
                      active
                        ? "border-brand-primary/30 bg-brand-soft"
                        : "border-stroke-subtle bg-surface hover:bg-surfaceAlt"
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-primary">
                          {label}
                        </div>
                        {sub ? (
                          <div className="mt-0.5 truncate text-xs text-text-muted">
                            {sub}
                          </div>
                        ) : null}
                      </div>

                      <span className="shrink-0 rounded-full border border-stroke-subtle bg-surfaceAlt px-2 py-1 text-[11px] font-semibold text-text-muted">
                        Avg {avg}
                      </span>
                    </div>

                    <div className="mt-2 text-xs text-text-muted">
                      Sessions: {m.sessionsCount || 0} · Total: {m.totalAttendance || 0}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <SecondaryButton onClick={loadModules} disabled={loadingModules || recomputing}>
              Refresh
            </SecondaryButton>
            {selectedMeta ? (
              <span className="text-xs text-text-muted">
                Viewing:{" "}
                <span className="font-semibold text-text-primary">
                  {selectedMeta.moduleCode || selectedMeta.moduleTitle || selectedMeta.id}
                </span>
              </span>
            ) : (
              <span className="text-xs text-text-muted">Select a module</span>
            )}
          </div>
        </aside>

        {/* Right content */}
        <section className="min-h-[320px]">
          {selected ? (
            <ModuleAnalyticsView moduleId={selected} />
          ) : (
            <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">
              Select a module to begin.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}