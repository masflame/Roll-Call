// // @ts-nocheck
// import React, { useEffect, useState } from "react";
// import { doc, getDoc, collection, getDocs } from "firebase/firestore";
// import { db } from "../firebase";

// function SmallBar({ value, max = 100 }: { value: number; max?: number }) {
//   const pct = Math.round((value / max) * 100);
//   return (
//     <div className="h-3 w-full bg-surfaceAlt rounded overflow-hidden">
//       <div className="h-3 bg-brand-primary" style={{ width: `${pct}%` }} />
//     </div>
//   );
// }

// export default function ModuleAnalyticsView({ moduleId }: { moduleId: string }) {
//   const [module, setModule] = useState<any>(null);
//   const [roster, setRoster] = useState<any[]>([]);
//   const [students, setStudents] = useState<any[]>([]);

//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       if (!moduleId) return;
//       const mRef = doc(db, "moduleStats", moduleId);
//       const mSnap = await getDoc(mRef);
//       if (!mSnap.exists()) {
//         setModule(null);
//         return;
//       }
//       const m = mSnap.data();
//       if (mounted) setModule(m);

//       // backfill moduleCode/moduleTitle locally if missing
//       if ((!m.moduleCode || !m.moduleTitle) && mounted) {
//         try {
//           const sSnap = await getDocs(collection(db, "sessions"));
//           const match = sSnap.docs.find((sd) => {
//             const d: any = sd.data();
//             return d.moduleId === moduleId || d.moduleCode === moduleId || d.moduleId === m.moduleId || d.moduleCode === m.moduleId;
//           });
//           if (match) {
//             const d: any = match.data();
//             const patched = { ...m, moduleCode: d.moduleCode || m.moduleCode, moduleTitle: d.moduleTitle || d.moduleName || m.moduleTitle };
//             setModule(patched);
//           }
//         } catch (e) {}
//       }

//       // load roster and moduleStudents
//       const rosterSnap = await getDocs(collection(db, `moduleRosters/${moduleId}/students`));
//       const r: any[] = [];
//       rosterSnap.forEach((d) => r.push({ id: d.id, ...d.data() }));
//       if (mounted) setRoster(r);

//       const studentsSnap = await getDocs(collection(db, `moduleStudents/${moduleId}/students`));
//       const s: any[] = [];
//       studentsSnap.forEach((d) => s.push({ id: d.id, ...d.data() }));
//       if (mounted) setStudents(s);
//     })();
//     return () => (mounted = false);
//   }, [moduleId]);

//   if (!moduleId) return <div className="text-sm text-text-muted">Select a module to view analytics.</div>;
//   if (!module) return <div className="text-sm text-text-muted">No stats available for this module yet.</div>;

//   const displayName = module.moduleCode || module.moduleTitle || module.moduleId || moduleId;
//   const displayTitle = module.moduleTitle || null;

//   const weeks = Object.keys(module.weekly || {}).sort();
//   const weeklyPoints = weeks.map((w) => {
//     const it = module.weekly[w];
//     const avg = it.sessions ? (it.totalAttendance / it.sessions) : 0;
//     return { week: w, avg };
//   });

//   const curveKeys = Object.keys(module.checkinCurvePercent || {});

//   const heatKeys = Object.keys(module.heatmap || []).sort();

//   const totalSessions = module.sessionsCount || 0;

//   // compute top absentees if roster present
//   const rosterMap = new Map(roster.map((r) => [String(r.studentNumber || r.id || "").trim(), r]));
//   const studentsMap = new Map(students.map((s) => [String(s.studentNumber || s.id || "").trim(), s]));
//   const merged: any[] = [];
//   rosterMap.forEach((r, key) => {
//     const k = String(key || "").trim();
//     const s = studentsMap.get(k) || {};
//     const attended = s.attendedCount || 0;
//     const absent = totalSessions ? Math.max(0, totalSessions - attended) : null;
//     merged.push({ studentNumber: k, name: r.name || "", surname: r.surname || "", attended, absent, late: s.lateCount || 0 });
//   });

//   // include students without roster
//   students.forEach((s) => {
//     const k = String(s.studentNumber || s.id || "").trim();
//     if (rosterMap.has(k)) return;
//     const attended = s.attendedCount || 0;
//     const absent = totalSessions ? Math.max(0, totalSessions - attended) : null;
//     merged.push({ studentNumber: k, name: s.name || "", surname: s.surname || "", attended, absent, late: s.lateCount || 0 });
//   });

//   const topAbsentees = merged
//     .filter((m) => m.absent !== null)
//     .sort((a, b) => (b.absent || 0) - (a.absent || 0))
//     .slice(0, 10);

//   const studentsPresent = merged.length > 0;

//   function downloadCsv() {
//     const rows = [
//       ["Module", module.moduleCode || module.moduleTitle || module.moduleId || moduleId],
//       ["AvgAttendance", String(module.avgAttendance || "")],
//       [],
//       ["StudentNumber", "Name", "Attended", "Absent", "Late"]
//     ].concat(merged.map((r) => [r.studentNumber, `${r.name} ${r.surname}`.trim(), String(r.attended || 0), String(r.absent ?? ""), String(r.late || 0)]));
//     const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
//     // prepend UTF-8 BOM so Excel recognises UTF-8 and separates columns
//     const bom = "\uFEFF";
//     const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const a = document.createElement("a");
//     a.href = url;
//     a.download = `${moduleId}-summary.csv`;
//     a.click();
//     URL.revokeObjectURL(url);
//   }

//   return (
//     <div className="space-y-6">
//       <div className="rounded-2xl border p-4">
//         <div className="text-sm text-text-muted">Module</div>
//         <div className="mt-1 text-xl font-semibold">{displayName}</div>
//         {displayTitle && <div className="text-sm text-text-muted">{displayTitle}</div>}
//       </div>
//       <div className="grid gap-4 sm:grid-cols-3">
//         <div className="rounded-2xl border p-4">
//           <div className="text-xs text-text-muted">Avg attendance</div>
//           <div className="mt-2 text-2xl font-bold">{Math.round((module.avgAttendance || 0) * 100) / 100}</div>
//           <div className="mt-2 text-xs text-text-muted">Sessions: {totalSessions}</div>
//         </div>

//         <div className="rounded-2xl border p-4">
//           <div className="text-xs text-text-muted">Median check-in (min)</div>
//           <div className="mt-2 text-2xl font-bold">{module.medianCheckinMinutes ?? "—"}</div>
//           <div className="mt-2 text-xs text-text-muted">Completion curve</div>
//           <div className="mt-2 space-y-2">
//             {curveKeys.map((k) => (
//               <div key={k} className="text-sm">
//                 <div className="flex items-center justify-between mb-1">
//                   <div className="text-xs text-text-muted">{k}</div>
//                   <div className="text-sm font-semibold">{module.checkinCurvePercent?.[k] ?? 0}%</div>
//                 </div>
//                 <SmallBar value={module.checkinCurvePercent?.[k] ?? 0} max={100} />
//               </div>
//             ))}
//           </div>
//         </div>

//         <div className="rounded-2xl border p-4">
//           <div className="flex items-center justify-between">
//             <div>
//               <div className="text-xs text-text-muted">Export</div>
//               <div className="mt-2 text-sm">Download a CSV summary of this module.</div>
//             </div>
//             <div>
//               <button onClick={downloadCsv} className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand">Export CSV</button>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div className="grid gap-6 lg:grid-cols-3">
//         <div className="rounded-2xl border p-4 lg:col-span-2">
//           <h4 className="text-sm font-semibold">Weekly attendance trend</h4>
//           <div className="mt-3 flex gap-2 items-end" style={{ height: 120 }}>
//             {weeklyPoints.length === 0 && <div className="text-sm text-text-muted">No weekly data</div>}
//             {weeklyPoints.map((p) => {
//               const max = Math.max(...weeklyPoints.map((x) => x.avg), 1);
//               const h = Math.round((p.avg / max) * 100);
//               return (
//                 <div key={p.week} className="flex-1 text-center">
//                   <div className="mx-auto w-full bg-surfaceAlt rounded-t" style={{ height: `${h}%` }} />
//                   <div className="mt-2 text-xs text-text-muted">{p.week}</div>
//                 </div>
//               );
//             })}
//           </div>

//           <h4 className="mt-6 text-sm font-semibold">Heatmap (day_hour)</h4>
//           <div className="mt-3 grid grid-cols-6 gap-1">
//             {Object.entries(module.heatmap || {}).map(([k, v]) => {
//               const avg = v.sessions ? Math.round((v.totalAttendance / v.sessions) * 100) / 100 : 0;
//               const color = `rgba(59,130,246, ${Math.min(0.9, Math.max(0.05, avg / (module.avgAttendance || 1)))})`;
//               return (
//                 <div key={k} className="p-2 text-xs text-center rounded" style={{ background: color }}>
//                   <div className="font-semibold">{k.replace("_", " ")}</div>
//                   <div className="text-xs">{avg}</div>
//                 </div>
//               );
//             })}
//           </div>
//         </div>

//         <div className="rounded-2xl border p-4">
//           <h4 className="text-sm font-semibold">Top absentees</h4>
//           <div className="mt-3 space-y-2 text-sm">
//             {topAbsentees.length === 0 && <div className="text-xs text-text-muted">No roster or attendance data to compute absentees.</div>}
//             {topAbsentees.map((t) => (
//               <div key={t.studentNumber} className="flex items-center justify-between">
//                 <div>
//                   <div className="font-semibold">{t.name ? `${t.name} ${t.surname || ""}`.trim() : t.studentNumber}</div>
//                   <div className="text-xs text-text-muted">{t.studentNumber}</div>
//                 </div>
//                 <div className="text-sm">Absent: {t.absent}</div>
//               </div>
//             ))}
//           </div>
//         </div>
//       </div>

//       <div className="rounded-2xl border p-4">
//         <h4 className="text-sm font-semibold">Students</h4>
//           <div className="mt-3 grid gap-2">
//           {!studentsPresent && <div className="text-xs text-text-muted">No students found for this module. Ensure roster is uploaded or wait for nightly recompute.</div>}
//           {merged.map((s) => {
//             const rate = totalSessions ? (s.attended / totalSessions) : null;
//             const band = rate === null ? "Unknown" : rate >= 0.8 ? "Green" : rate >= 0.6 ? "Amber" : "Red";
//             return (
//               <div key={s.studentNumber} className="flex items-center justify-between">
//                 <div>
//                   <div className="font-semibold">{s.studentNumber} {s.name ? `— ${s.name}` : ""}</div>
//                   <div className="text-xs text-text-muted">Attended: {s.attended} · Late: {s.late}</div>
//                 </div>
//                 <div className="text-sm">{band}</div>
//               </div>
//             );
//           })}
//         </div>
//       </div>
//     </div>
//   );
// }


/* =======================================================================
   ModuleAnalyticsView (cleaned, enterprise / Notion x Linear style)
   ======================================================================= */

// @ts-nocheck
import React3, { useEffect as useEffect3, useMemo as useMemo3, useState as useState3 } from "react";
import { doc, getDoc, collection as collection3, getDocs as getDocs3 } from "firebase/firestore";
import { db as db3 } from "../firebase";

function MetricCard({ label, value, hint, action }: any) {
  return (
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-4 shadow-subtle">
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
    </div>
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

export function ModuleAnalyticsView({ moduleId }: { moduleId: string }) {
  const [module, setModule] = useState3<any>(null);
  const [roster, setRoster] = useState3<any[]>([]);
  const [students, setStudents] = useState3<any[]>([]);
  const [loading, setLoading] = useState3(true);

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

    return () => {
      mounted = false;
    };
  }, [moduleId]);

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
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">
        Select a module to view analytics.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">
        Loading module analytics…
      </div>
    );
  }

  if (!module) {
    return (
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 text-sm text-text-muted shadow-subtle">
        No stats available for this module yet.
      </div>
    );
  }

  const displayName = module.moduleCode || module.moduleTitle || module.moduleId || moduleId;
  const displayTitle = module.moduleTitle || null;

  const avgAttendance = Math.round((Number(module.avgAttendance || 0) * 100)) / 100;
  const medianCheckin = module.medianCheckinMinutes ?? "—";

  const heatmapEntries = Object.entries(module.heatmap || {});

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
          Module
        </p>
        <div className="mt-1 text-xl font-semibold text-text-primary">{displayName}</div>
        {displayTitle ? <div className="mt-1 text-sm text-text-muted">{displayTitle}</div> : null}
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Avg attendance"
          value={avgAttendance}
          hint={`Sessions: ${totalSessions}`}
        />
        <MetricCard
          label="Median check-in (min)"
          value={medianCheckin}
          hint="Completion curve below."
        />
        <MetricCard
          label="Export"
          value="CSV"
          hint="Download a roster summary for this module."
          action={
            <button
              onClick={downloadCsv}
              className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90"
            >
              Export CSV
            </button>
          }
        />
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
                weeklyPoints.map((p) => {
                  const max = Math.max(...weeklyPoints.map((x) => x.avg), 1);
                  const h = Math.round((p.avg / max) * 100);
                  return (
                    <div key={p.week} className="flex-1 text-center">
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
                heatmapEntries.map(([k, v]: any) => {
                  const avg = v.sessions ? Math.round((v.totalAttendance / v.sessions) * 100) / 100 : 0;
                  const base = Number(module.avgAttendance || 1);
                  const alpha = Math.min(0.85, Math.max(0.08, avg / base));
                  return (
                    <div
                      key={k}
                      className="rounded-xl border border-stroke-subtle p-3"
                      style={{ background: `rgba(59,130,246, ${alpha})` }}
                    >
                      <div className="text-xs font-semibold text-white">{k.replace("_", " ")}</div>
                      <div className="mt-1 text-xs text-white/90">Avg {avg}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

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
                  return (
                    <div key={k}>
                      <div className="mb-1 flex items-center justify-between">
                        <div className="text-xs text-text-muted">{k}</div>
                        <div className="text-xs font-semibold text-text-primary">{val}%</div>
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
                    <Pill tone="warning">Absent {t.absent}</Pill>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Students list */}
      <div className="rounded-2xl border border-stroke-subtle bg-surface p-5 shadow-subtle">
        <SectionTitle
          title="Students"
          subtitle="Attendance banding (Green/Amber/Red) based on attended sessions."
          right={<Pill>{merged.length}</Pill>}
        />

        <div className="mt-4 divide-y divide-stroke-subtle rounded-2xl border border-stroke-subtle">
          {merged.length === 0 ? (
            <div className="p-4 text-sm text-text-muted">
              No students found. Upload roster or wait for recompute.
            </div>
          ) : (
            merged.map((s) => {
              const rate = totalSessions ? s.attended / totalSessions : null;
              const band =
                rate === null ? "Unknown" : rate >= 0.8 ? "Green" : rate >= 0.6 ? "Amber" : "Red";
              const tone = band === "Green" ? "success" : band === "Amber" ? "warning" : band === "Red" ? "neutral" : "neutral";

              return (
                <div key={s.studentNumber} className="flex items-center justify-between gap-4 p-4 hover:bg-surfaceAlt">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-text-primary">
                      {s.studentNumber}
                      {s.name ? <span className="text-text-muted"> — {s.name}</span> : null}
                      {s.surname ? <span className="text-text-muted"> {s.surname}</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-text-muted">
                      Attended: {s.attended} · Late: {s.late} · Absent: {s.absent ?? "—"}
                    </div>
                  </div>
                  <Pill tone={tone}>{band}</Pill>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}