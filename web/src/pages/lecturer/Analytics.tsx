
// @ts-nocheck
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { collection, getDocs, query as queryFn, where as whereFn, doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { auth } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";
import * as ModuleAnalyticsModule from "../../components/ModuleAnalyticsView";
import { useModules } from "../../lib/hooks/useModules";
const ModuleAnalyticsView = (ModuleAnalyticsModule && (ModuleAnalyticsModule.default || ModuleAnalyticsModule.ModuleAnalyticsView)) || (function MissingModuleView() { return <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">Module analytics component unavailable.</div>; });
import { Pill, PrimaryButton, SecondaryButton } from "../../components/ui";
import ActionSelect from "../../components/ui/Selects";

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
  const [visibleModules, setVisibleModules] = useState<Record<string, boolean>>({});
  const moduleTimers = useRef<number[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [offerings, setOfferings] = useState<any[]>([]);
  const [selectedOffering, setSelectedOffering] = useState<string | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const { data: modules = [], isLoading: loadingModules } = useModules(auth.currentUser?.uid);

  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMessage, setRecomputeMessage] = useState<string | null>(null);

  // animate reveal when modules change
  useEffect(() => {
    moduleTimers.current.forEach((t) => clearTimeout(t));
    moduleTimers.current = [];
    setVisibleModules({});
    modules.forEach((m, i) => {
      const t = window.setTimeout(() => setVisibleModules((p) => ({ ...p, [m.id]: true })), i * 60);
      moduleTimers.current.push(t as unknown as number);
    });
    if (modules.length && !selected) setSelected(modules[0].id);
    return () => moduleTimers.current.forEach((t) => clearTimeout(t));
  }, [modules]);

  // animate right content when selected changes
  const [contentVisible, setContentVisible] = useState(false);
  useEffect(() => {
    setContentVisible(false);
    const t = window.setTimeout(() => setContentVisible(true), 30);
    return () => clearTimeout(t as unknown as number);
  }, [selected]);

  // Load offerings when module changes
  useEffect(() => {
    if (!selected) {
      setOfferings([]);
      setSelectedOffering(null);
      return;
    }

    (async () => {
      const snap = await getDocs(collection(db, "offerings"));
      const items: any[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.moduleId === selected) items.push({ id: d.id, ...data });
      });
      setOfferings(items);
      if (items.length && !selectedOffering) setSelectedOffering(items[0].id);
    })();
  }, [selected, selectedOffering]);

  // Load groups when offering changes
  useEffect(() => {
    if (!selectedOffering) {
      setGroups([]);
      setSelectedGroup(null);
      return;
    }

    (async () => {
      const snap = await getDocs(collection(db, "groups"));
      const items: any[] = [];
      snap.forEach((d) => {
        const data = d.data() as any;
        if (data.offeringId === selectedOffering) items.push({ id: d.id, ...data });
      });
      setGroups(items);
      if (items.length && !selectedGroup) setSelectedGroup(items[0].id);
    })();
  }, [selectedOffering, selectedGroup]);

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
    <div className="space-y-6">
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
            <PrimaryButton onClick={handleRecompute} disabled={recomputing} className="!px-4 !py-2.5 !text-sm">
              {recomputing ? "Recomputing…" : "Recompute (90 days)"}
            </PrimaryButton>
            {recomputeMessage ? <Pill>{recomputeMessage}</Pill> : null}
          </div>
        </div>
      </div>

      {/* Main layout */}
      <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
        {/* Left rail */}
          <aside className="rounded-2xl border border-stroke-subtle bg-white p-6 shadow-none">
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
                      "w-full rounded-xl border px-3 py-3 text-left transition-all duration-300 ease-out",
                      visibleModules[m.id] ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3",
                      active
                        ? "border-brand-primary/30 bg-brand-soft"
                        : "border-stroke-subtle bg-surface hover:bg-surfaceAlt hover:shadow-sm"
                    )}
                    style={{ willChange: "opacity, transform" }}
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
            <div
              className={cx(
                "rounded-2xl border border-stroke-subtle bg-surface p-6",
                contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
              )}
              style={{ transition: "opacity 260ms ease, transform 320ms cubic-bezier(.2,.9,.25,1)" }}
            >
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <label className="text-sm font-semibold text-text-primary">Offering</label>
                <div className="w-56">
                  <ActionSelect
                    value={selectedOffering ?? 'all'}
                    onChange={(v) => setSelectedOffering(v === 'all' ? null : v)}
                    options={offerings.map((o) => ({ label: o.label || (o.academicYear ? `${o.academicYear}${o.term ? ` • ${o.term}` : ''}` : o.id), value: o.id }))}
                  />
                </div>

                <label className="text-sm font-semibold text-text-primary">Group</label>
                <div className="w-56">
                  <ActionSelect
                    value={selectedGroup ?? 'all'}
                    onChange={(v) => setSelectedGroup(v === 'all' ? null : v)}
                    options={groups.map((g) => ({ label: g.label || g.name || g.id, value: g.id }))}
                  />
                </div>
              </div>

              <ModuleAnalyticsView moduleId={selected} offeringId={selectedOffering} groupId={selectedGroup} />
            </div>
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