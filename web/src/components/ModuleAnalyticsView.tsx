

/* =======================================================================
   ModuleAnalyticsView (cleaned, enterprise / Notion x Linear style)
   ======================================================================= */

// @ts-nocheck
import React3, { useEffect as useEffect3, useMemo as useMemo3, useState as useState3, useRef as useRef3 } from "react";
import { Info } from "lucide-react";
import { doc, getDoc, collection as collection3, getDocs as getDocs3, query, where } from "firebase/firestore";
import { db as db3 } from "../firebase";
import { Pill } from "./ui";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}


import { Card } from "./ui";

function MetricCard({ label, value, hint, action, visible = true, style }: any) {
  return (
    <Card
      className={cx(
        "bg-white border border-gray-200 shadow-subtle transition-all duration-300 transform",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      )}
      style={style}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-muted">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
          {hint ? <p className="mt-1 text-sm text-text-muted">{hint}</p> : null}
        </div>
        {action ? <div>{action}</div> : null}
      </div>
    </Card>
  );
}

function SmallBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surfaceAlt">
      <div className="h-2 bg-brand-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}



function SectionTitle({ title, subtitle, right }: any) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-text-muted">{subtitle}</p> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}

export function ModuleAnalyticsView({ moduleId, offeringId, groupId }: { moduleId: string; offeringId?: string | null; groupId?: string | null }) {
  const [module, setModule] = useState3<any>(null);
  const [roster, setRoster] = useState3<any[]>([]);
  const [students, setStudents] = useState3<any[]>([]);
  const [integrityFlagTotal, setIntegrityFlagTotal] = useState3<number>(0);
  const [loading, setLoading] = useState3(true);
  const [filteredSessions, setFilteredSessions] = useState3<any[]>([]);
  const [filteredTotals, setFilteredTotals] = useState3<any>({ sessions: 0, submissions: 0 });
  const [contentVisible, setContentVisible] = useState3(false);
  const contentTimer = useRef3<number | null>(null);

  useEffect3(() => {
    let mounted = true;
    (async () => {
      if (!moduleId) return;
      setLoading(true);

      try {
        const mRef = doc(db3, "moduleStats", moduleId);
        const mSnap = await getDoc(mRef);
        if (!mSnap.exists()) {
          if (mounted) setModule(null);
          return;
        }

        const m = mSnap.data();
        if (mounted) setModule(m);

        const rosterSnap = await getDocs3(collection3(db3, `moduleRosters/${moduleId}/students`));
        const r: any[] = [];
        rosterSnap.forEach((d) => r.push({ id: d.id, ...d.data() }));
        if (mounted) setRoster(r);

        const studentsSnap = await getDocs3(collection3(db3, `moduleStudents/${moduleId}/students`));
        const s: any[] = [];
        studentsSnap.forEach((d) => s.push({ id: d.id, ...d.data() }));
        if (mounted) setStudents(s);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    // trigger content reveal animation
    setContentVisible(false);
    if (contentTimer.current) window.clearTimeout(contentTimer.current as number);
    contentTimer.current = window.setTimeout(() => setContentVisible(true), 30) as unknown as number;

    return () => {
      mounted = false;
      if (contentTimer.current) window.clearTimeout(contentTimer.current as number);
    };
  }, [moduleId]);

  // If offeringId/groupId filters are provided, aggregate session-level stats for the filtered set
  useEffect3(() => {
    let mounted = true;
    (async () => {
      if (!moduleId) return;

      try {
        const sessionsRef = collection3(db3, "sessions");
        // Build base query
        let q: any = query(sessionsRef, where("moduleId", "==", moduleId));
        if (offeringId && groupId) {
          q = query(sessionsRef, where("moduleId", "==", moduleId), where("offeringId", "==", offeringId), where("groupId", "==", groupId));
        } else if (offeringId) {
          q = query(sessionsRef, where("moduleId", "==", moduleId), where("offeringId", "==", offeringId));
        } else if (groupId) {
          q = query(sessionsRef, where("moduleId", "==", moduleId), where("groupId", "==", groupId));
        }

        const snap = await getDocs3(q);
        const sessions: any[] = [];
        let submissions = 0;
        snap.forEach((s: any) => {
          const data = s.data();
          const sc = Number((data?.stats && data.stats.submissionsCount) || 0);
          submissions += sc;
          sessions.push({ sessionId: s.id, ...data });
        });

        // fetch sessionStats for integrity flags (velocityFlags) for the filtered sessions
        let integrityFlagsTotal = 0;
        try {
          const statPromises = sessions.map((s) => getDoc(doc(db3, "sessionStats", s.sessionId)));
          const statSnaps = await Promise.all(statPromises);
          statSnaps.forEach((ss) => {
            if (ss && ss.exists()) {
              const d = ss.data() as any;
              integrityFlagsTotal += Number(d?.proxyFlags || d?.velocityFlags || 0);
            }
          });
        } catch (err) {
          // ignore
        }

        if (mounted) {
          setFilteredSessions(sessions);
          setFilteredTotals({ sessions: sessions.length, submissions });
          setIntegrityFlagTotal(integrityFlagsTotal);
        }
      } catch (err) {
        if (mounted) {
          setFilteredSessions([]);
          setFilteredTotals({ sessions: 0, submissions: 0 });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [moduleId, offeringId, groupId]);

  const totalSessions = Number(module?.sessionsCount || 0);

  const merged = useMemo3(() => {
    const rosterMap = new Map(
      roster.map((r) => [String(r.studentNumber || r.id || "").trim(), r])
    );
    const studentsMap = new Map(
      students.map((s) => [String(s.studentNumber || s.id || "").trim(), s])
    );

    const out: any[] = [];
    rosterMap.forEach((r, key) => {
      const k = String(key || "").trim();
      const s = studentsMap.get(k) || {};
      const attended = Number(s.attendedCount || 0);
      const absent = totalSessions ? Math.max(0, totalSessions - attended) : null;
      out.push({
        studentNumber: k,
        name: r.name || s.name || "",
        surname: r.surname || s.surname || "",
        attended,
        absent,
        late: Number(s.lateCount || 0),
      });
    });

    students.forEach((s) => {
      const k = String(s.studentNumber || s.id || "").trim();
      if (rosterMap.has(k)) return;
      const attended = Number(s.attendedCount || 0);
      const absent = totalSessions ? Math.max(0, totalSessions - attended) : null;
      out.push({
        studentNumber: k,
        name: s.name || "",
        surname: s.surname || "",
        attended,
        absent,
        late: Number(s.lateCount || 0),
      });
    });

    out.sort((a, b) => (a.studentNumber || "").localeCompare(b.studentNumber || ""));
    return out;
  }, [roster, students, totalSessions]);

  const topAbsentees = useMemo3(() => {
    return merged
      .filter((m) => m.absent !== null)
      .sort((a, b) => (Number(b.absent || 0) - Number(a.absent || 0)))
      .slice(0, 10);
  }, [merged]);

  const weeklyPoints = useMemo3(() => {
    const weeks = Object.keys(module?.weekly || {}).sort();
    return weeks.map((w) => {
      const it = module.weekly[w];
      const avg = it.sessions ? it.totalAttendance / it.sessions : 0;
      return { week: w, avg };
    });
  }, [module]);

  const curveKeys = useMemo3(() => Object.keys(module?.checkinCurvePercent || {}), [module]);

  function downloadCsv() {
    const rows = [
      ["Module", module?.moduleCode || module?.moduleTitle || module?.moduleId || moduleId],
      ["AvgAttendance", String(module?.avgAttendance || "")],
      ["SessionsCount", String(totalSessions || 0)],
      [],
      ["StudentNumber", "Name", "Attended", "Absent", "Late"],
      ...merged.map((r) => [
        r.studentNumber,
        `${r.name} ${r.surname}`.trim(),
        String(r.attended || 0),
        String(r.absent ?? ""),
        String(r.late || 0),
      ]),
    ];

    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const bom = "\uFEFF";
    const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${moduleId}-summary.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!moduleId) {
    return (
      <Card className="text-sm text-text-muted" variant="panel">
        Select a module to view analytics.
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="text-sm text-text-muted" variant="panel">
        Loading module analytics…
      </Card>
    );
  }

  if (!module) {
    return (
      <Card className="text-sm text-text-muted" variant="panel">
        No stats available for this module yet.
      </Card>
    );
  }

  const displayName = module.moduleCode || module.moduleTitle || module.moduleId || moduleId;
  const displayTitle = module.moduleTitle || null;

  // If filtered totals exist, prefer them for the filtered view
  const useFiltered = Boolean(offeringId || groupId) && filteredTotals && filteredTotals.sessions > 0;

  const avgAttendance = useFiltered ? (filteredTotals.submissions / Math.max(1, filteredTotals.sessions)) : Number(module.avgAttendance || 0);
  const avgAttendanceDisplay = (isFinite(avgAttendance) ? Number(avgAttendance) : 0).toFixed(2);
  const medianCheckin = useFiltered ? null : module.medianCheckinMinutes ?? null;
  const medianCheckinDisplay = typeof medianCheckin === "number" ? medianCheckin.toFixed(2) : "—";

  const heatmapEntries = Object.entries(module.heatmap || {});

  return (
    <div className="space-y-6">
      {/* Module header */}
      <Card className="bg-white border border-gray-200 shadow-subtle p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Module
        </p>
        <div className="mt-1 text-xl font-semibold text-text-primary">{displayName}</div>
        {displayTitle ? <div className="mt-1 text-sm text-text-muted">{displayTitle}</div> : null}
      </Card>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Avg attendance",
            value: avgAttendanceDisplay,
            hint: useFiltered ? `Sessions (filtered): ${filteredTotals.sessions}` : `Sessions: ${totalSessions}`,
          },
          { label: "Median check-in (min)", value: medianCheckinDisplay, hint: "Completion curve below." },
          { label: "Integrity flags", value: String(integrityFlagTotal || 0), hint: useFiltered ? `Filtered sessions: ${filteredTotals.sessions}` : `Across module sessions` },
          { label: "Export", value: "CSV", hint: "Download a roster summary for this module.", action: (
            <button
              onClick={downloadCsv}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand transition hover:bg-brand-primary/90"
            >
              Export CSV
            </button>
          ) }
        ].map((m, idx) => (
          <MetricCard key={m.label} {...m} visible={contentVisible} style={{ transitionDelay: `${idx * 80}ms` }} />
        ))}
      </div>

      {/* Curve + Trend + Heatmap + Absentees */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Trend + Heatmap */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
            <SectionTitle
              title="Weekly trend"
              subtitle="Average attendance per week (relative bars)."
            />
            <div className="mt-4 flex items-end gap-2" style={{ height: 120 }}>
                  {weeklyPoints.length === 0 ? (
                <div className="text-sm text-text-muted">No weekly data.</div>
              ) : (
                weeklyPoints.map((p, idx) => {
                  const max = Math.max(...weeklyPoints.map((x) => x.avg), 1);
                      const h = Math.round((p.avg / max) * 100);
                  return (
                    <div key={p.week} className={cx("flex-1 text-center transition-all duration-300 transform", contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")} style={{ transitionDelay: `${idx * 40}ms` }}>
                      <div className="mx-auto w-full rounded-t bg-brand-soft" style={{ height: `${h}%` }} />
                      <div className="mt-2 text-[11px] text-text-muted">{p.week}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
            <SectionTitle
              title="Heatmap"
              subtitle="Average attendance by day + hour bucket."
            />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {heatmapEntries.length === 0 ? (
                <div className="col-span-full text-sm text-text-muted">No heatmap data.</div>
              ) : (
                heatmapEntries.map(([k, v]: any, idx) => {
                  const avg = v.sessions ? Number((v.totalAttendance / v.sessions)) : 0;
                  const avgDisplay = avg.toFixed(2);
                  const base = Number(module.avgAttendance || 1);
                  const alpha = base ? Math.min(0.85, Math.max(0.08, avg / base)) : 0.08;
                  const isFaint = alpha < 0.18;

                  const cellStyle = isFaint ? undefined : { background: `rgba(59,130,246, ${alpha})` };
                  const cellClass = `rounded-xl border border-stroke-subtle p-3 ${isFaint ? "bg-surfaceAlt" : ""}`;

                  return (
                    <div key={k} className={cx(cellClass, "transition-all duration-300 transform", contentVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2")} style={{ ...(cellStyle || {}), transitionDelay: `${idx * 30}ms` }}>
                      <div className={`text-xs font-semibold ${isFaint ? "text-text-primary" : "text-white"}`}>{k.replace("_", " ")}</div>
                      <div className={`mt-1 text-xs ${isFaint ? "text-text-muted" : "text-white/90"}`}>Avg {avgDisplay}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Students list (match heatmap width) */}
          <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
            <SectionTitle
              title="Students"
              subtitle="Attendance banding"
              right={
                <div className="flex items-center gap-3">
                  <InfoLegend />
                  <Pill>{merged.length}</Pill>
                </div>
              }
            />

            <div className="mt-4 divide-y divide-stroke-subtle rounded-2xl border border-stroke-subtle">
              {merged.length === 0 ? (
                <div className="p-4 text-sm text-text-muted">No students found. Upload roster or wait for recompute.</div>
              ) : (
                merged.map((s, idx) => {
                  const rate = totalSessions ? s.attended / totalSessions : null;
                  const band =
                    rate === null ? "Unknown" : rate >= 0.8 ? "Green" : rate >= 0.6 ? "Amber" : "Red";
                  const tone = band === "Green" ? "success" : band === "Amber" ? "warning" : band === "Red" ? "danger" : "neutral";

                  return (
                    <div key={s.studentNumber} className={cx("flex items-center justify-between gap-4 p-3 hover:bg-surfaceAlt transition-all duration-300 transform", contentVisible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-3")} style={{ transitionDelay: `${idx * 18}ms` }}>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-primary">
                          {s.studentNumber}{s.name ? <span className="text-text-muted"> — {s.name}</span> : null}{s.surname ? <span className="text-text-muted"> {s.surname}</span> : null}
                        </div>
                        <div className="mt-1 text-xs text-text-muted">Attended: {s.attended} · Late: {s.late} · Absent: {s.absent ?? "—"}</div>
                      </div>
                      <Pill tone={tone}>{band}</Pill>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Group comparisons when offering selected */}
        {offeringId ? (
          <div className="space-y-6 lg:col-span-1">
            <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
              <SectionTitle title="By-group comparison" subtitle="Compare total submissions per group" />
              <div className="mt-4 space-y-2">
                {(() => {
                  // compute group aggregates from filteredSessions
                  const map: Record<string, { sessions: number; submissions: number }> = {};
                  filteredSessions.forEach((s) => {
                    const gid = s.groupId || "__ungrouped";
                    if (!map[gid]) map[gid] = { sessions: 0, submissions: 0 };
                    map[gid].sessions += 1;
                    map[gid].submissions += Number((s.stats && s.stats.submissionsCount) || 0);
                  });

                  const rows = Object.entries(map).sort((a, b) => b[1].submissions - a[1].submissions);
                  if (rows.length === 0) return <div className="text-sm text-text-muted">No sessions for this offering.</div>;
                  return rows.map(([gid, val]) => (
                    <div key={gid} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-text-primary">{gid === "__ungrouped" ? "Ungrouped" : gid}</div>
                        <div className="mt-1 text-xs text-text-muted">Sessions: {val.sessions}</div>
                      </div>
                      <div className="tabular-nums text-sm font-semibold">{val.submissions}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        ) : null}

        {/* Right: Curve + absentees */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
            <SectionTitle
              title="Completion curve"
              subtitle="How quickly students check in."
            />
            <div className="mt-4 space-y-3">
              {curveKeys.length === 0 ? (
                <div className="text-sm text-text-muted">No curve data.</div>
              ) : (
                curveKeys.map((k) => {
                  const val = Number(module.checkinCurvePercent?.[k] ?? 0);
                  const valDisplay = val.toFixed(2);
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-xs text-text-muted">{k}</div>
                        <div className="text-xs font-semibold text-text-primary">{valDisplay}%</div>
                      </div>
                      <SmallBar value={val} max={100} />
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
            <SectionTitle title="Top absentees" subtitle="Highest missed sessions (if roster exists)." />
            <div className="mt-4 space-y-3">
              {topAbsentees.length === 0 ? (
                <div className="text-sm text-text-muted">
                  No roster / attendance data to compute absentees.
                </div>
              ) : (
                topAbsentees.map((t) => (
                  <div key={t.studentNumber} className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-text-primary">
                        {t.name ? `${t.name} ${t.surname || ""}`.trim() : t.studentNumber}
                      </div>
                      <div className="truncate text-xs text-text-muted">{t.studentNumber}</div>
                    </div>
                    <Pill tone="warning" title={`Missed ${t.absent} sessions`}>Absent {t.absent}</Pill>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      
    </div>
  );
}

function InfoLegend() {
  const [open, setOpen] = useState3(false);
  const label = "Green ≥80% · Amber 60–79% · Red <60% (Red = low attendance)";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label="Legend"
        className="rounded-full p-1 text-xs text-text-muted hover:bg-surfaceAlt"
        title={label}
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