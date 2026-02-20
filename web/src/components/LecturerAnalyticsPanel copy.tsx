// // @ts-nocheck
// import React, { useEffect, useState } from "react";
// import { collection, getDocs } from "firebase/firestore";
// import { db } from "../firebase";

// export default function LecturerAnalyticsPanel() {
//   const [modules, setModules] = useState<any[]>([]);

//   useEffect(() => {
//     let mounted = true;
//     (async () => {
//       try {
//         const snap = await getDocs(collection(db, "moduleStats"));
//         const items: any[] = [];
//         snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
//         if (mounted) setModules(items);
//       } catch (err) {
//         console.error(err);
//       }
//     })();
//     return () => {
//       mounted = false;
//     };
//   }, []);

//   return (
//     <div className="rounded-3xl border border-stroke-subtle bg-surface p-6">
//       <h3 className="text-lg font-semibold text-text-primary">Module analytics (recent)</h3>
//       <p className="text-sm text-text-muted">A lightweight view of `moduleStats` documents.</p>

//       <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
//         {modules.length === 0 && (
//           <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-6 text-sm text-text-muted">
//             No analytics yet — run a session or wait for nightly compute.
//           </div>
//         )}

//         {modules.map((m) => (
//           <div key={m.moduleId || m.id} className="rounded-2xl border p-4">
//             <div className="text-sm font-semibold text-text-primary">{m.moduleId}</div>
//             <div className="mt-2 text-2xl font-bold text-text-primary">{Math.round((m.avgAttendance || 0) * 100) / 100}</div>
//             <div className="mt-1 text-sm text-text-muted">Avg attendance (last {m.windowDays || 30} days)</div>
//             <div className="mt-3 text-xs text-text-muted">
//               Sessions: {m.sessionsCount || 0} · Total attended: {m.totalAttendance || 0}
//             </div>
//           </div>
//         ))}
//       </div>
//     </div>
//   );
// }


/* =======================================================================
   LecturerAnalyticsPanel (cleaned, optional, keep if you still use it)
   ======================================================================= */

// @ts-nocheck
import React2, { useEffect as useEffect2, useState as useState2 } from "react";
import { collection as collection2, getDocs as getDocs2 } from "firebase/firestore";
import { db as db2 } from "../firebase";

export function LecturerAnalyticsPanel() {
  const [modules, setModules] = useState2<any[]>([]);
  const [loading, setLoading] = useState2(true);

  useEffect2(() => {
    let mounted = true;
    (async () => {
      try {
        const snap = await getDocs2(collection2(db2, "moduleStats"));
        const items: any[] = [];
        snap.forEach((d) => items.push({ id: d.id, ...d.data() }));
        items.sort((a, b) => Number(b.sessionsCount || 0) - Number(a.sessionsCount || 0));
        if (mounted) setModules(items);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="rounded-2xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">Module analytics</h3>
          <p className="mt-1 text-sm text-text-muted">
            Lightweight snapshot of <span className="font-mono">moduleStats</span>.
          </p>
        </div>
        <Pill tone={modules.length ? "success" : "neutral"}>{modules.length}</Pill>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <>
            <div className="animate-pulse rounded-2xl border border-stroke-subtle bg-surface p-4">
              <div className="h-4 w-2/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-8 w-1/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-3 w-1/2 rounded bg-surfaceAlt" />
            </div>
            <div className="animate-pulse rounded-2xl border border-stroke-subtle bg-surface p-4">
              <div className="h-4 w-2/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-8 w-1/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-3 w-1/2 rounded bg-surfaceAlt" />
            </div>
            <div className="animate-pulse rounded-2xl border border-stroke-subtle bg-surface p-4">
              <div className="h-4 w-2/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-8 w-1/3 rounded bg-surfaceAlt" />
              <div className="mt-3 h-3 w-1/2 rounded bg-surfaceAlt" />
            </div>
          </>
        ) : modules.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-6 text-sm text-text-muted">
            No analytics yet — run a session or wait for nightly compute.
          </div>
        ) : (
          modules.map((m) => (
            <div key={m.moduleId || m.id} className="rounded-2xl border border-stroke-subtle bg-surface p-4">
              <div className="text-sm font-semibold text-text-primary">
                {m.moduleCode || m.moduleId || m.id}
              </div>
              <div className="mt-2 text-2xl font-bold text-text-primary">
                {Math.round((m.avgAttendance || 0) * 100) / 100}
              </div>
              <div className="mt-1 text-sm text-text-muted">
                Avg attendance (last {m.windowDays || 30} days)
              </div>
              <div className="mt-3 text-xs text-text-muted">
                Sessions: {m.sessionsCount || 0} · Total attended: {m.totalAttendance || 0}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}