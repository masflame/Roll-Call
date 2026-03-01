// @ts-nocheck
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where, addDoc, serverTimestamp } from "firebase/firestore";
import { Link } from "react-router-dom";
import { auth, db } from "../../firebase";
import {
  Calendar,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Clock,
  BookOpen,
  Users,
  SlidersHorizontal,
  X,
} from "lucide-react";
import ActionSelect, { MultiSelect } from "../../components/ui/Selects";
import Spinner from "../../components/ui/Spinner";
import Skeleton from "../../components/ui/Skeleton";
// PageHeader removed from this page

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
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  // default expanded groups: Today and Active Sessions
  useEffect(() => {
    // initialize defaults after sessions load
    if (!loading) {
      // collapse everything by default
      const defaults: Record<string, boolean> = {};

      // ensure module groups exist and are collapsed
      Object.keys(groupsByModule || {}).forEach((m) => {
        defaults[m] = false;
      });

      // ensure date groups exist and are collapsed
      Object.keys(groupsByDate || {}).forEach((d) => {
        defaults[d] = false;
      });

      // ensure status groups exist and are collapsed
      Object.keys(groupsByStatus || {}).forEach((s) => {
        defaults[s] = false;
      });

      // exceptions: expand Today and Active Sessions if present
      if (groupsByDate && groupsByDate["Today"]) defaults["Today"] = true;
      if (groupsByStatus && groupsByStatus["Active Sessions"]) defaults["Active Sessions"] = true;

      setExpandedGroups((p) => ({ ...defaults, ...p }));
    }
    // only run when loading flips to false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    if (!user) return;
    const sessionsRef = collection(db, "sessions");
    const q = query(sessionsRef, where("lecturerId", "==", user.uid), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => {
          const docData = docSnap.data();
          return {
            id: docSnap.id,
            moduleCode: docData.moduleCode,
            title: docData.title,
            createdAt: docData.createdAt?.toDate ? docData.createdAt.toDate().toISOString() : "",
            stats: docData.stats,
            isActive: docData.isActive,
          };
        });
        setSessions(data);
        setLoading(false);
      },
      (error) => {
        console.error("Error fetching sessions:", error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const moduleOptions = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => set.add(s.moduleCode || ""));
    return Array.from(set).filter(Boolean).sort();
  }, [sessions]);

          const filteredSessions = useMemo(() => {
            return sessions.filter((s) => {
              // Module filter
              if (selectedModules.length > 0 && !selectedModules.includes(s.moduleCode)) return false;
      
              // Status filter
              if (statusFilter !== "all") {
                if (statusFilter === "active" && !s.isActive) return false;
                if (statusFilter === "closed" && s.isActive) return false;
              }
      
              // Date filter
              if (dateRange !== "all" && s.createdAt) {
                const created = new Date(s.createdAt);
                const now = new Date();
        
                if (dateRange === "today") {
                  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                  if (created < start) return false;
                }
        
                if (dateRange === "week") {
                  const start = new Date(now);
                  start.setDate(now.getDate() - 7);
                  if (created < start) return false;
                }
        
                if (dateRange === "month") {
                  const start = new Date(now);
                  start.setMonth(now.getMonth() - 1);
                  if (created < start) return false;
                }
              }
      
              // Search filter
              if (search) {
                const q = search.toLowerCase();
                const titleMatch = (s.title || "").toLowerCase().includes(q);
                const moduleMatch = (s.moduleCode || "").toLowerCase().includes(q);
                const idMatch = s.id.toLowerCase().includes(q);
                if (!titleMatch && !moduleMatch && !idMatch) return false;
              }
      
              return true;
            });
          }, [sessions, selectedModules, statusFilter, dateRange, search]);

          const groupsByModule = useMemo(() => {
            const map: Record<string, SessionSummary[]> = {};
            filteredSessions.forEach((s) => {
              const key = s.moduleCode || "Ungrouped";
              if (!map[key]) map[key] = [];
              map[key].push(s);
            });
            return map;
          }, [filteredSessions]);

          const groupsByDate = useMemo(() => {
            const map: Record<string, SessionSummary[]> = {};
            filteredSessions.forEach((s) => {
              if (!s.createdAt) {
                if (!map["Unknown"]) map["Unknown"] = [];
                map["Unknown"].push(s);
                return;
              }
      
              const date = new Date(s.createdAt);
              const today = new Date();
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);
      
              let key = "Older";
      
              if (date.toDateString() === today.toDateString()) {
                key = "Today";
              } else if (date.toDateString() === yesterday.toDateString()) {
                key = "Yesterday";
              } else if (date > new Date(today.setDate(today.getDate() - 7))) {
                key = "This Week";
              } else if (date > new Date(today.setMonth(today.getMonth() - 1))) {
                key = "This Month";
              }
      
              if (!map[key]) map[key] = [];
              map[key].push(s);
            });
    
            // Sort groups by recency
            const order = ["Today", "Yesterday", "This Week", "This Month", "Older", "Unknown"];
            const sorted: Record<string, SessionSummary[]> = {};
            order.forEach(key => {
              if (map[key]) sorted[key] = map[key];
            });
    
            return sorted;
          }, [filteredSessions]);

          const groupsByStatus = useMemo(() => {
            const active = filteredSessions.filter(s => s.isActive);
            const closed = filteredSessions.filter(s => !s.isActive);
    
            return {
              "Active Sessions": active,
              "Closed Sessions": closed
            };
          }, [filteredSessions]);

          const toggleGroup = (key: string) => {
            setExpandedGroups((p) => ({ ...p, [key]: !p[key] }));
          };

          const duplicateSession = async (session: SessionSummary) => {
            try {
              const newDoc = {
                moduleCode: session.moduleCode,
                title: session.title ? `Copy of ${session.title}` : `Copy of ${session.id}`,
                stats: session.stats || {},
                isActive: false,
                lecturerId: user?.uid || null,
                createdAt: serverTimestamp(),
              } as any;

              await addDoc(collection(db, "sessions"), newDoc);
              // eslint-disable-next-line no-console
              console.log("Session duplicated", session.id);
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error("Failed to duplicate session", err);
            }
          };

          const clearFilters = () => {
            setSelectedModules([]);
            setStatusFilter("all");
            setDateRange("all");
            setSearch("");
          };

          const totalSubmissions = filteredSessions.reduce((acc, s) => acc + (s.stats?.submissionsCount || 0), 0);
          const activeCount = filteredSessions.filter(s => s.isActive).length;

          const getGroupedContent = () => {
            switch (groupBy) {
              case "now":
                // Quick mode: only active sessions, grouped by module
                return Object.keys(groupsByModule).reduce((acc: Record<string, SessionSummary[]>, key) => {
                  const items = (groupsByModule[key] || []).filter(s => s.isActive);
                  if (items.length) acc[key] = items;
                  return acc;
                }, {} as Record<string, SessionSummary[]>);
              case "date":
                return groupsByDate;
              case "status":
                return groupsByStatus;
              default:
                return groupsByModule;
            }
          };

          const groups = getGroupedContent();

          return (
            <div className="min-h-screen bg-gray-50">
              <div className="space-y-6">
                {/* Header */}
                <div className="mb-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h1 className="text-2xl font-semibold text-gray-900">Attendance History</h1>
                      <p className="mt-1 text-sm text-gray-500">
                        Review completed sessions and export records
                      </p>
                    </div>
            
                    {/* Summary Stats (stack on mobile, row on larger screens) */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="w-full sm:w-auto text-center sm:text-right">
                        <p className="text-sm text-gray-500">Total Sessions</p>
                        <p className="text-xl font-semibold text-gray-900">{filteredSessions.length}</p>
                      </div>
                      <div className="w-full sm:w-auto text-center sm:text-right">
                        <p className="text-sm text-gray-500">Submissions</p>
                        <p className="text-xl font-semibold text-gray-900">{totalSubmissions}</p>
                      </div>
                      <div className="w-full sm:w-auto text-center sm:text-right">
                        <p className="text-sm text-gray-500">Active</p>
                        <p className="text-xl font-semibold text-emerald-600">{activeCount}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Filters Bar */}
                <div className="mb-6 bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-4">
                    <div className="flex flex-col gap-4">
                      {/* Primary Filters */}
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Filter className="h-4 w-4 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700">Group by:</span>
                        </div>
                
                        {
                          /* animated sliding indicator behind equal-width buttons */
                        }
                        <div className="relative inline-flex rounded-lg border border-gray-200 p-1 bg-white w-full max-w-md">
                          <div
                            aria-hidden
                            className="absolute top-1 left-1 bottom-1 rounded-md shadow-md"
                            style={{
                              width: `${100 / 4}%`,
                              transform: `translateX(${(() => {
                                const order = ["now", "module", "date", "status"];
                                return order.indexOf(groupBy) * 100;
                              })()}%)`,
                              transition: 'transform 320ms cubic-bezier(.2,.8,.2,1)',
                              background: 'linear-gradient(90deg, #00121a, #000000)',
                              zIndex: 0,
                            }}
                          />

                          {[
                            { key: 'now', label: 'Now (Active)' },
                            { key: 'module', label: 'Module' },
                            { key: 'date', label: 'Date' },
                            { key: 'status', label: 'Status' },
                          ].map((b) => (
                            <button
                              key={b.key}
                              onClick={() => setGroupBy(b.key)}
                              className={`relative z-10 flex-1 px-3 py-1.5 text-sm rounded-md transition-colors duration-200 ${
                                groupBy === b.key ? 'text-white' : 'text-gray-600 hover:text-gray-800'
                              }`}
                            >
                              {b.label}
                            </button>
                          ))}
                        </div>

                        <div className="h-4 w-px bg-gray-200 mx-2" />

                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search by title, module, or ID..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-lg border border-gray-200 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                          />
                        </div>

                        <button
                          onClick={() => setShowFilters(!showFilters)}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
                        >
                          <SlidersHorizontal className="h-4 w-4" />
                          More Filters
                          <ChevronDown className={`h-4 w-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {/* Advanced Filters */}
                      {showFilters && (
                        <div className="pt-4 border-t border-gray-200">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            {/* Module Filter */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Modules
                              </label>
                              {/* TODO: Replace this <select multiple> with chips + searchable dropdown for better UX on mobile/laptops */}
                              <div>
                                <MultiSelect
                                  options={moduleOptions}
                                  value={selectedModules}
                                  onChange={(v) => setSelectedModules(v)}
                                  placeholder="Filter modules..."
                                />
                              </div>
                              {selectedModules.length > 0 && (
                                <button
                                  onClick={() => setSelectedModules([])}
                                  className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Clear selection
                                </button>
                              )}
                            </div>

                            {/* Status Filter */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Status
                              </label>
                              <ActionSelect value={statusFilter} onChange={setStatusFilter} options={["active","closed"]} allLabel={"All Statuses"} />
                            </div>

                            {/* Date Range Filter */}
                            <div>
                              <label className="block text-xs font-medium text-gray-500 mb-1">
                                Date Range
                              </label>
                              <ActionSelect value={dateRange} onChange={setDateRange} options={["today","week","month"]} allLabel={"All Time"} />
                            </div>
                          </div>

                          {/* Active Filters */}
                          {(selectedModules.length > 0 || statusFilter !== "all" || dateRange !== "all" || search) && (
                            <div className="mt-4 flex items-center gap-2">
                              <span className="text-xs text-gray-500">Active filters:</span>
                              {selectedModules.length > 0 && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs">
                                  {selectedModules.length} modules
                                </span>
                              )}
                              {statusFilter !== "all" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs">
                                  {statusFilter === "active" ? "Active" : "Closed"}
                                </span>
                              )}
                              {dateRange !== "all" && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs">
                                  {dateRange === "today" ? "Today" : dateRange === "week" ? "Last 7 days" : "Last 30 days"}
                                </span>
                              )}
                              {search && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs">
                                  Search: "{search}"
                                </span>
                              )}
                              <button
                                onClick={clearFilters}
                                className="text-xs text-gray-500 hover:text-gray-700 underline"
                              >
                                Clear all
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Results Section */}
                <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {loading ? (
                    <div className="p-12 text-center">
                      <Spinner size={32} className="mx-auto mb-4" />
                      <div className="space-y-3 mt-6">
                        {[...Array(4)].map((_, i) => (
                          <Skeleton key={i} className="h-6 w-full max-w-lg mx-auto" />
                        ))}
                      </div>
                    </div>
                  ) : Object.keys(groups).length === 0 ? (
                    <div className="p-12 text-center">
                      <div className="bg-gray-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                        <Calendar className="h-8 w-8 text-gray-400" />
                      </div>
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No sessions found</h3>
                      <p className="text-sm text-gray-500 max-w-sm mx-auto">
                        {search || selectedModules.length > 0 || statusFilter !== "all" || dateRange !== "all"
                          ? "Try adjusting your filters to see more results."
                          : "Get started by creating your first session."}
                      </p>
                      {(search || selectedModules.length > 0 || statusFilter !== "all" || dateRange !== "all") && (
                        <button
                          onClick={clearFilters}
                          className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
                        >
                          <X className="h-4 w-4" />
                          Clear all filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200">
                      {Object.entries(groups).map(([groupName, items]) => {
                        const isExpanded = !!expandedGroups[groupName];
                        const groupActiveCount = items.filter((i) => i.isActive).length;
                        const groupSubmissions = items.reduce((acc, it) => acc + (it.stats?.submissionsCount || 0), 0);

                        return (
                          <div key={groupName} className="group">
                            <div
                              className="bg-white px-6 py-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() => toggleGroup(groupName)}
                            >
                              <div className="flex items-center gap-4">
                                <button className="text-gray-400 hover:text-gray-600">
                                  <ChevronDown className={`h-5 w-5 transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`} />
                                </button>

                                <div>
                                  <h3 className="text-base font-semibold text-gray-900">
                                    {groupName}
                                    <span className="ml-2 text-sm font-normal text-gray-500">({items.length} session{items.length !== 1 ? 's' : ''})</span>
                                  </h3>
                                  <div className="flex items-center gap-3 mt-1">
                                    {groupActiveCount > 0 && (
                                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                        {groupActiveCount} active
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                                      <Users className="h-3 w-3" />
                                      {groupSubmissions} total submissions
                                    </span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleGroup(groupName);
                                  }}
                                  className="text-sm text-gray-500 hover:text-gray-700"
                                >
                                  {isExpanded ? 'Collapse' : 'Expand'}
                                </button>
                              </div>
                            </div>

                            <div
                              style={{
                                overflow: 'hidden',
                                maxHeight: isExpanded ? `${Math.min(items.length * 76, 1600)}px` : '0px',
                                transition: 'max-height 360ms cubic-bezier(.2,.8,.2,1)',
                              }}
                            >
                              <div className={`divide-y divide-gray-100 bg-white`}>
                                {items.map((session, idx) => (
                                  <div
                                    key={session.id}
                                    className="px-4 py-3 hover:bg-gray-50"
                                    style={{
                                      opacity: isExpanded ? 1 : 0,
                                      transform: isExpanded ? 'translateY(0)' : 'translateY(-6px)',
                                      transition: `opacity 240ms ease ${isExpanded ? idx * 25 : 0}ms, transform 260ms ease ${isExpanded ? idx * 25 : 0}ms`,
                                    }}
                                  >
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                          <BookOpen className="h-4 w-4 text-gray-400" />
                                          <span className="text-sm font-medium text-gray-900">{session.moduleCode}</span>
                                          {session.title && (
                                            <>
                                              <span className="text-gray-300">•</span>
                                              <span className="text-sm text-gray-600 truncate">{session.title}</span>
                                            </>
                                          )}
                                        </div>

                                        <div className="flex items-center gap-3 mt-2">
                                          <div className="flex items-center gap-1 text-xs text-gray-500">
                                            <Clock className="h-3 w-3" />
                                            {session.createdAt ? new Date(session.createdAt).toLocaleString() : '—'}
                                          </div>

                                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${session.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{session.isActive ? 'Active' : 'Closed'}</span>
                                        </div>
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3">
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-gray-900">{session.stats?.submissionsCount || 0}</p>
                                          <p className="text-xs text-gray-500">submissions</p>
                                        </div>

                                        <div className="h-8 w-px bg-gray-200" />

                                        <Link to={`/history/${session.id}`} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">
                                          <Eye className="h-4 w-4" />
                                          View Details
                                        </Link>

                                        <Link to={`/history/${session.id}/export`} className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 transition-colors whitespace-nowrap">
                                          <Download className="h-4 w-4" />
                                          Export
                                        </Link>

                                        <button onClick={() => duplicateSession(session)} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors whitespace-nowrap">Duplicate</button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                {/* Bottom Stats */}
                {filteredSessions.length > 0 && (
                  <div className="mt-4 text-xs text-gray-500 text-right">
                    Showing {filteredSessions.length} of {sessions.length} total sessions
                  </div>
                )}
              </div>
            </div>
          );
        }

        export default History;
