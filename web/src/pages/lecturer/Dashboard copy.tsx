// // // // @ts-nocheck
// // // import { Link } from "react-router-dom";
// // // // removed inline analytics panel to declutter; use dedicated Analytics page

// // // function Dashboard() {
// // //   const heroMetrics = [
// // //     {
// // //       title: "Status",
// // //       value: "No session in progress",
// // //       description: "Launch a new session to begin capturing attendance.",
// // //       variant: "neutral"
// // //     },
// // //     {
// // //       title: "Today",
// // //       value: "0 classes scheduled",
// // //       description: "Build your schedule from your assigned modules.",
// // //       variant: "info"
// // //     },
// // //     {
// // //       title: "Recent",
// // //       value: "0 submissions",
// // //       description: "Attendance updates appear here in real-time.",
// // //       variant: "success"
// // //     }
// // //   ];

// // //   return (
// // //     <div className="space-y-10">
// // //       <section className="rounded-3xl border border-stroke-subtle bg-surface shadow-subtle">
// // //         <div className="grid gap-10 p-8 lg:grid-cols-[1fr,0.9fr] lg:p-10">
// // //           <div className="space-y-8">
// // //             <div className="space-y-3">
// // //               <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-primary/70">Quietly confident</p>
// // //               <h1 className="text-3xl font-semibold leading-tight text-text-primary">Your teaching day at a glance</h1>
// // //               <p className="max-w-xl text-base text-text-muted">
// // //                 RollCall keeps sessions, attendance, and exports within one calm workspace so you can stay focused on the lecture.
// // //               </p>
// // //             </div>
// // //             <div className="flex flex-wrap items-center gap-3">
// // //               <Link
// // //                 to="/sessions/new"
// // //                 className="rounded-full bg-brand-primary px-5 py-2 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90"
// // //               >
// // //                 Start new session
// // //               </Link>
// // //               <Link
// // //                 to="/sessions/new"
// // //                 className="rounded-full border border-brand-secondary/40 px-5 py-2 text-sm font-semibold text-brand-secondary transition hover:bg-brand-soft"
// // //               >
// // //                 View live panel
// // //               </Link>
// // //               <Link
// // //                 to="/settings"
// // //                 className="rounded-full border border-stroke-subtle px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted transition hover:bg-surfaceAlt"
// // //               >
// // //                 Configure workspace
// // //               </Link>
// // //             </div>
// // //             <div className="grid gap-4 sm:grid-cols-3">
// // //               {heroMetrics.map((metric) => (
// // //                 <div
// // //                   key={metric.title}
// // //                   className={`rounded-2xl border p-5 ${
// // //                     metric.variant === "success"
// // //                       ? "border-accent-success/40 bg-accent-success/5 text-text-primary"
// // //                       : metric.variant === "info"
// // //                         ? "border-brand-secondary/30 bg-brand-soft text-text-primary"
// // //                         : "border-stroke-subtle bg-surfaceAlt text-text-primary"
// // //                   }`}
// // //                 >
// // //                   <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{metric.title}</p>
// // //                   <p className="mt-3 text-lg font-semibold leading-snug text-text-primary">{metric.value}</p>
// // //                   <p className="mt-2 text-sm text-text-muted">{metric.description}</p>
// // //                 </div>
// // //               ))}
// // //             </div>
// // //           </div>
// // //           <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-1">
// // //             <div className="rounded-2xl border border-stroke-subtle bg-surfaceAlt p-6">
// // //               <h2 className="text-lg font-semibold text-text-primary">Plan once, repeat effortlessly</h2>
// // //               <p className="mt-2 text-sm text-text-muted">
// // //                 Save venues, windows, and attendance preferences. RollCall applies them automatically every time you launch a session.
// // //               </p>
// // //               <Link
// // //                 to="/modules"
// // //                 className="mt-4 inline-flex items-center justify-center rounded-full bg-brand-soft px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft/80"
// // //               >
// // //                 Manage modules
// // //               </Link>
// // //             </div>
// // //             <div className="rounded-2xl border border-dashed border-stroke-subtle bg-surfaceAlt p-6">
// // //               <h3 className="text-base font-semibold text-text-primary">Compliance-ready exports</h3>
// // //               <p className="mt-2 text-sm text-text-muted">
// // //                 CSV or PDF summaries are moments away. Need historical context? Jump into your attendance archive.
// // //               </p>
// // //               <Link
// // //                 to="/history"
// // //                 className="mt-4 inline-flex items-center text-sm font-semibold text-brand-secondary hover:underline"
// // //               >
// // //                 Review attendance history
// // //               </Link>
// // //             </div>
// // //           </div>
// // //         </div>
// // //       </section>

// // //       <section className="grid gap-6 xl:grid-cols-[2fr,1fr]">
// // //         <div className="rounded-3xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
// // //           <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
// // //             <div>
// // //               <h2 className="text-xl font-semibold text-text-primary">Today&apos;s classes</h2>
// // //               <p className="text-sm text-text-muted">A structured timetable generated from your modules.</p>
// // //             </div>
// // //             <Link
// // //               to="/modules"
// // //               className="inline-flex items-center justify-center rounded-full border border-brand-soft px-4 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft"
// // //             >
// // //               Manage modules
// // //             </Link>
// // //           </div>
// // //           <div className="mt-6 overflow-hidden rounded-2xl border border-stroke-subtle bg-surfaceAlt">
// // //             <table className="min-w-full text-sm text-text-primary">
// // //               <thead className="bg-brand-soft text-xs font-semibold uppercase tracking-wide text-brand-primary">
// // //                 <tr>
// // //                   <th className="px-5 py-3 text-left">Time</th>
// // //                   <th className="px-5 py-3 text-left">Module</th>
// // //                   <th className="px-5 py-3 text-left">Venue</th>
// // //                   <th className="px-5 py-3 text-left">Status</th>
// // //                 </tr>
// // //               </thead>
// // //               <tbody className="divide-y divide-stroke-subtle">
// // //                 <tr>
// // //                   <td className="px-5 py-3 text-text-muted">--</td>
// // //                   <td className="px-5 py-3 text-text-muted">No classes scheduled</td>
// // //                   <td className="px-5 py-3 text-text-muted">--</td>
// // //                   <td className="px-5 py-3 text-text-muted">--</td>
// // //                 </tr>
// // //               </tbody>
// // //             </table>
// // //           </div>
// // //         </div>
// // //           <div className="space-y-4 rounded-3xl border border-stroke-subtle bg-surface p-6 shadow-subtle">
// // //           <div>
// // //             <h2 className="text-xl font-semibold text-text-primary">Recent attendance</h2>
// // //             <p className="text-sm text-text-muted">Latest sessions captured across your modules.</p>
// // //           </div>
// // //           <div className="grid gap-4 sm:grid-cols-2">
// // //             <Link
// // //               to="/analytics"
// // //               className="rounded-2xl border p-6 text-left hover:bg-surfaceAlt"
// // //             >
// // //               <p className="text-sm font-semibold text-text-primary">Analytics</p>
// // //               <p className="mt-2 text-sm text-text-muted">Open the analytics dashboard for trends, heatmaps and integrity panels.</p>
// // //             </Link>

// // //             <div className="rounded-2xl border p-6">
// // //               <p className="text-sm font-semibold text-text-primary">Recent attendance</p>
// // //               <p className="mt-2 text-sm text-text-muted">Live session submissions appear here when sessions are active.</p>
// // //             </div>
// // //           </div>
// // //         </div>
// // //       </section>
// // //     </div>
// // //   );
// // // }

// // // export default Dashboard;



// @ts-nocheck
import React from "react";
import { Link } from "react-router-dom";

function Dashboard() {
  const metrics = [
    {
      label: "Status",
      value: "No session in progress",
      hint: "Start a session to begin capturing attendance.",
      tone: "neutral",
    },
    {
      label: "Today",
      value: "0 classes scheduled",
      hint: "Build a timetable from your assigned modules.",
      tone: "info",
    },
    {
      label: "Recent",
      value: "0 submissions",
      hint: "Live submissions appear while a session is active.",
      tone: "success",
    },
  ];

  const pills = [
    { label: "Start new session", to: "/sessions/new", kind: "primary" },
    { label: "View live panel", to: "/sessions/new", kind: "secondary" },
    { label: "Configure workspace", to: "/settings", kind: "ghost" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      {/* Top header (Notion x Linear vibe) */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-text-muted">
            RollCall
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Dashboard
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-text-muted">
            Calm overview of your sessions, timetable, and exports—built for lecturers who
            want speed without noise.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {pills.map((p) => (
            <Link
              key={p.label}
              to={p.to}
              className={[
                "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition",
                p.kind === "primary"
                  ? "bg-brand-primary text-text-onBrand shadow-brand hover:bg-brand-primary/90"
                  : p.kind === "secondary"
                  ? "border border-stroke-subtle bg-surface hover:bg-surfaceAlt text-text-primary"
                  : "border border-transparent bg-transparent text-text-muted hover:bg-surfaceAlt",
              ].join(" ")}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </header>

      {/* Metrics row (simple, Linear-like) */}
      <section className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
        <div className="grid gap-0 divide-y divide-stroke-subtle sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
          {metrics.map((m) => (
            <div key={m.label} className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {m.label}
                </p>

                <span
                  className={[
                    "h-2 w-2 rounded-full",
                    m.tone === "success"
                      ? "bg-accent-success"
                      : m.tone === "info"
                      ? "bg-brand-secondary"
                      : "bg-stroke-subtle",
                  ].join(" ")}
                  aria-hidden="true"
                />
              </div>

              <p className="mt-2 text-base font-semibold text-text-primary">{m.value}</p>
              <p className="mt-1 text-sm text-text-muted">{m.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Main content */}
      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        {/* Today table */}
        <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
          <div className="flex flex-col gap-3 border-b border-stroke-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">Today’s classes</h2>
              <p className="mt-1 text-sm text-text-muted">
                Generated from your modules and timetable rules.
              </p>
            </div>

            <Link
              to="/modules"
              className="inline-flex items-center justify-center rounded-full border border-stroke-subtle bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
            >
              Manage modules
            </Link>
          </div>

          <div className="overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-surfaceAlt text-xs font-semibold uppercase tracking-wide text-text-muted">
                <tr>
                  <th className="px-5 py-3 text-left">Time</th>
                  <th className="px-5 py-3 text-left">Module</th>
                  <th className="px-5 py-3 text-left">Venue</th>
                  <th className="px-5 py-3 text-left">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-stroke-subtle bg-surface">
                <tr className="hover:bg-surfaceAlt">
                  <td className="px-5 py-3 text-text-muted">—</td>
                  <td className="px-5 py-3 text-text-muted">No classes scheduled</td>
                  <td className="px-5 py-3 text-text-muted">—</td>
                  <td className="px-5 py-3 text-text-muted">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Subtle footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stroke-subtle p-5">
            <p className="text-xs text-text-muted">
              Tip: once modules are loaded, RollCall can auto-build your weekly timetable.
            </p>

            <div className="flex items-center gap-2">
              <Link
                to="/history"
                className="rounded-full px-3 py-2 text-sm font-semibold text-brand-secondary transition hover:bg-brand-soft"
              >
                Attendance history
              </Link>
              <Link
                to="/sessions/new"
                className="rounded-full px-3 py-2 text-sm font-semibold text-brand-primary transition hover:bg-brand-soft"
              >
                Start session
              </Link>
            </div>
          </div>
        </div>

        {/* Right column: quick links + recent */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
            <div className="border-b border-stroke-subtle p-5">
              <h2 className="text-lg font-semibold text-text-primary">Quick actions</h2>
              <p className="mt-1 text-sm text-text-muted">
                Jump straight to what you need.
              </p>
            </div>

            <div className="p-2">
              <Link
                to="/analytics"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Analytics</p>
                  <p className="text-sm text-text-muted">
                    Trends, heatmaps, integrity insights, exports.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>

              <Link
                to="/modules"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Modules</p>
                  <p className="text-sm text-text-muted">
                    Upload class lists, manage venues, session defaults.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>

              <Link
                to="/history"
                className="flex items-start justify-between gap-3 rounded-xl p-4 transition hover:bg-surfaceAlt"
              >
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-text-primary">Archive</p>
                  <p className="text-sm text-text-muted">
                    Search past sessions and export CSV/PDF.
                  </p>
                </div>
                <span className="mt-1 text-xs font-semibold text-text-muted">↗</span>
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-stroke-subtle bg-surface shadow-subtle">
            <div className="border-b border-stroke-subtle p-5">
              <h2 className="text-lg font-semibold text-text-primary">Recent activity</h2>
              <p className="mt-1 text-sm text-text-muted">
                Latest sessions and submissions across modules.
              </p>
            </div>

            <div className="p-5">
              <div className="rounded-xl border border-dashed border-stroke-subtle bg-surfaceAlt p-4">
                <p className="text-sm font-semibold text-text-primary">Nothing yet</p>
                <p className="mt-1 text-sm text-text-muted">
                  Start a session and live submissions will show up here.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to="/sessions/new"
                    className="inline-flex items-center justify-center rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand transition hover:bg-brand-primary/90"
                  >
                    Start session
                  </Link>
                  <Link
                    to="/settings"
                    className="inline-flex items-center justify-center rounded-full border border-stroke-subtle bg-surface px-4 py-2 text-sm font-semibold text-text-primary transition hover:bg-surfaceAlt"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

export default Dashboard;
