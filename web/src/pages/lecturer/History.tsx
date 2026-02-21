// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { auth, db } from "../../firebase";
import PageHeader from "../../components/PageHeader";

interface SessionSummary {
  id: string;
  moduleCode: string;
  title?: string;
  createdAt?: string;
  stats?: {
    submissionsCount?: number;
  };
  isActive: boolean;
}

function History() {
  const user = auth.currentUser;
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [groupBy, setGroupBy] = useState<string>("module");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<string>("all");
  const [search, setSearch] = useState<string>("");

  useEffect(() => {
    if (!user) return;
    const sessionsRef = collection(db, "sessions");
    const q = query(sessionsRef, where("lecturerId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((docSnap) => {
        const docData = docSnap.data();
        return {
          id: docSnap.id,
          moduleCode: docData.moduleCode,
          title: docData.title,
          createdAt: docData.createdAt?.toDate ? docData.createdAt.toDate().toISOString() : "",
          stats: docData.stats,
          isActive: docData.isActive
        };
      });
      setSessions(data);
    });
    return () => unsubscribe();
  }, [user]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.moduleCode || ""));
    return Array.from(set).filter(Boolean).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (selectedModules.length > 0 && !selectedModules.includes(s.moduleCode)) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "active" && !s.isActive) return false;
        if (statusFilter === "closed" && s.isActive) return false;
      }
      if (dateRange !== "all" && s.createdAt) {
        const created = new Date(s.createdAt);
        const now = new Date();
        if (dateRange === "today") {
          const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          if (!(created >= start)) return false;
        }
        if (dateRange === "week") {
          const start = new Date(now);
          start.setDate(now.getDate() - 7);
          if (!(created >= start)) return false;
        }
      }
      if (search) {
        const q = search.toLowerCase();
        if (!((s.title || "").toLowerCase().includes(q) || (s.moduleCode || "").toLowerCase().includes(q) || s.id.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }, [sessions, selectedModules, statusFilter, dateRange, search]);

  const groupsByModule = useMemo(() => {
    const map: Record<string, SessionSummary[]> = {};
    filteredSessions.forEach((s) => {
      const key = s.moduleCode || "(No module)";
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    return map;
  }, [filteredSessions]);

  const toggleGroup = (key: string) => setExpandedGroups((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance history" description="Review completed sessions and export records." showBack={false} noBackground />

      {/* Sticky filter bar */}
      <div className="sticky top-14 z-40 bg-surface/95 border-b border-stroke-subtle">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold">Group by</div>
            <div className="inline-flex rounded bg-white/50 p-1">
              <button onClick={() => setGroupBy("module")} className={`px-3 py-1 text-sm ${groupBy === "module" ? "bg-surfaceAlt font-semibold" : "text-text-muted"}`}>Module</button>
              <button onClick={() => setGroupBy("date")} className={`px-3 py-1 text-sm ${groupBy === "date" ? "bg-surfaceAlt font-semibold" : "text-text-muted"}`}>Date</button>
              <button onClick={() => setGroupBy("status")} className={`px-3 py-1 text-sm ${groupBy === "status" ? "bg-surfaceAlt font-semibold" : "text-text-muted"}`}>Status</button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select multiple value={selectedModules} onChange={(e) => setSelectedModules(Array.from(e.target.selectedOptions).map((o) => o.value))} className="rounded-md border px-3 py-1 text-sm">
              {moduleOptions.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-md border px-3 py-1 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>

            <select value={dateRange} onChange={(e) => setDateRange(e.target.value)} className="rounded-md border px-3 py-1 text-sm">
              <option value="all">Any time</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
            </select>

            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, module, id" className="rounded-md border px-3 py-1 text-sm" />
          </div>
        </div>
      </div>

      <section className="rounded-md border border-stroke-subtle bg-surface shadow-subtle">
        {/* Grouped by module (default) */}
        {groupBy === "module" && (
          <div>
            {Object.keys(groupsByModule).length === 0 && (
              <div className="px-6 py-10 text-center text-sm text-text-muted">No sessions recorded yet.</div>
            )}

            {Object.entries(groupsByModule).map(([moduleCode, items]) => {
              const activeCount = items.filter((i) => i.isActive).length;
              const totalSubs = items.reduce((acc, it) => acc + (it.stats?.submissionsCount || 0), 0);
              const headerKey = moduleCode;
              const expanded = !!expandedGroups[headerKey];
              return (
                <div key={headerKey} className="border-b border-stroke-subtle">
                  <div className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0">
                      <button onClick={() => toggleGroup(headerKey)} className="text-left">
                        <div className="text-sm font-semibold text-text-primary truncate">{moduleCode} <span className="text-xs text-text-muted">({items.length} sessions)</span></div>
                        <div className="text-xs text-text-muted truncate">Active: {activeCount} • Total submissions: {totalSubs}</div>
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleGroup(headerKey)} className="rounded-md border px-3 py-1 text-sm">{expanded ? "Collapse" : "Expand"}</button>
                    </div>
                  </div>

                  {expanded && (
                    <ul className="divide-y divide-stroke-subtle">
                      {items.map((session) => (
                        <li key={session.id} className="flex flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-text-primary truncate">{session.title || session.id}</p>
                            <p className="text-xs text-text-muted">{session.createdAt}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="rounded-md border border-stroke-subtle px-3 py-1 text-xs text-text-muted">{session.stats?.submissionsCount ?? 0} submissions</span>
                            <span className={`rounded-md px-3 py-1 text-xs font-medium ${session.isActive ? "bg-accent-success/10 text-accent-success" : "bg-surfaceAlt text-text-muted"}`}>{session.isActive ? "Active" : "Closed"}</span>
                            <Link to={`/history/${session.id}`} className="text-sm font-semibold text-brand-primary hover:underline">View / Export</Link>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Fallback simple list when not grouping by module */}
        {groupBy !== "module" && (
          <ul className="divide-y divide-stroke-subtle">
            {filteredSessions.map((session) => (
              <li key={session.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text-primary">{session.moduleCode}{session.title ? ` • ${session.title}` : ""}</p>
                  <p className="text-xs text-text-muted">{session.createdAt || "--"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-md border border-stroke-subtle px-3 py-1 text-xs text-text-muted">{session.stats?.submissionsCount ?? 0} submissions</span>
                  <span className={`rounded-md px-3 py-1 text-xs font-medium ${session.isActive ? "bg-accent-success/10 text-accent-success" : "bg-surfaceAlt text-text-muted"}`}>{session.isActive ? "Active" : "Closed"}</span>
                  <Link to={`/history/${session.id}`} className="text-sm font-semibold text-brand-primary hover:underline">View / Export</Link>
                </div>
              </li>
            ))}
            {filteredSessions.length === 0 && (
              <li className="px-6 py-10 text-center text-sm text-text-muted">No sessions found for the selected filters.</li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

export default History;
