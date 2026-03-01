// @ts-nocheck
import { ReactNode, useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../../firebase";
import { getDelegateMode, clearDelegateMode } from "../../lib/delegate";
import ProfileMenu from "../ProfileMenu";
import { collection, onSnapshot, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
import { 
  LayoutDashboard, 
  BookOpen, 
  PlayCircle, 
  BarChart3, 
  History, 
  Settings,
  Menu,
  X,
  Calendar,
  ChevronRight,
  LogOut,
  Bell,
  HelpCircle,
  Activity
} from "lucide-react";

interface NavItem {
  label: string;
  to: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Modules", to: "/modules", icon: BookOpen },
  { label: "Sessions", to: "/sessions/new", icon: PlayCircle },
  { label: "Schedules", to: "/schedules", icon: Calendar },
  { label: "Analytics", to: "/analytics", icon: BarChart3 },
  { label: "History", to: "/history", icon: History },
  { label: "Delegated Modules", to: "/settings/shared-access", icon: Activity },
  { label: "Settings", to: "/settings", icon: Settings }
];

interface NavLinkItemProps {
  item: NavItem;
  onClick?: () => void;
}

function NavLinkItem({ item, onClick }: NavLinkItemProps) {
  const Icon = item.icon;
  
  return (
    <NavLink
      to={item.to}
      end={item.to === "/" || item.to === "/settings"}
      onClick={onClick}
      className={({ isActive }) => [
        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
        isActive 
          ? "bg-white/15 text-white" 
          : "text-white/70 hover:bg-white/10 hover:text-white"
      ].join(" ")}
    >
      {({ isActive }) => (
        <>
          <Icon className={`h-4 w-4 ${isActive ? "text-white" : "text-white/70"}`} />
          <span>{item.label}</span>
          {isActive && (
            <ChevronRight className="ml-auto h-4 w-4 text-white/50" />
          )}
        </>
      )}
    </NavLink>
  );
}

function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Menu panel */}
      <div className="fixed left-0 top-0 bottom-0 w-72 bg-gray-900 shadow-2xl transform transition-transform">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <button 
            onClick={() => {
              navigate("/");
              onClose();
            }} 
            className="text-left"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400">
              RollCall
            </div>
            <div className="mt-1 text-xl font-semibold text-white">
              Lecturer Console
            </div>
          </button>
          <button 
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-gray-800 transition-colors"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>
        
        <nav className="p-4 space-y-1">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} onClick={onClose} />
          ))}
        </nav>
        
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {(() => {
                    const name = auth.currentUser?.displayName || auth.currentUser?.email || "";
                    const words = String(name).split(/\s+/).filter(Boolean);
                    if (words.length === 0) return "U";
                    if (words.length === 1) return String(words[0].charAt(0)).toUpperCase();
                    return (String(words[0].charAt(0)) + String(words[1].charAt(0))).toUpperCase();
                  })()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {auth.currentUser?.displayName || auth.currentUser?.email}
                </p>
              <p className="text-xs text-gray-400 truncate">
                Lecturer
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} RollCall v1.0.0
          </p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, trend }: { label: string; value: string | number; icon: React.ElementType; trend?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-gray-500 font-medium">{label}</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{value}</p>
          {trend && (
            <p className="text-[11px] text-emerald-600 mt-1">{trend}</p>
          )}
        </div>
        <div className="bg-gray-100 rounded-md p-1.5">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
      </div>
    </div>
  );
}

function LecturerShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = auth.currentUser;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeCount, setActiveCount] = useState<number | null>(null);
  const [classesToday, setClassesToday] = useState<number | null>(null);
  const [totalStudents, setTotalStudents] = useState<number | null>(null);
  const [attendanceRate, setAttendanceRate] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<number>(0);
  
  // Hide header on live session pages
  const hideHeader = /^\/sessions\/[\w-]+\/live$/.test(location.pathname);
  
  // Get current page title
  const currentPage = navItems.find(item => 
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
  )?.label || "Dashboard";

  // Compute live stats for header
  useEffect(() => {
    if (!user) return;

    const sessionsRef = collection(db, "sessions");
    const q = query(sessionsRef, where("lecturerId", "==", user.uid), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, async (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

      // Active sessions (isActive true and not expired)
      const now = Date.now();
      const active = docs.filter((d) => {
        const expiresAt = d.expiresAt?.toDate ? d.expiresAt.toDate().getTime() : d.expiresAt ? new Date(d.expiresAt).getTime() : null;
        return d.isActive && (!expiresAt || expiresAt > now);
      }).length;
      setActiveCount(active);

      // Classes today: check scheduledAt or createdAt
      const startOfDay = new Date(); 
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(); 
      endOfDay.setHours(23, 59, 59, 999);
      
      const todayCount = docs.filter((d) => {
        const when = d.scheduledAt?.toDate ? d.scheduledAt.toDate() : 
                     d.scheduledAt ? new Date(d.scheduledAt) : 
                     d.createdAt?.toDate ? d.createdAt.toDate() : 
                     d.createdAt ? new Date(d.createdAt) : null;
        if (!when) return false;
        return when.getTime() >= startOfDay.getTime() && when.getTime() <= endOfDay.getTime();
      }).length;
      setClassesToday(todayCount);

      // Total submissions across sessions
      const totalSubmissions = docs.reduce((acc, d) => acc + (d.stats?.submissionsCount || 0), 0);

      // Compute total students by aggregating module rosters
      try {
        const modulesRef = collection(db, "modules");
        const modulesSnap = await getDocs(query(modulesRef, where("lecturerId", "==", user.uid)));
        const moduleIds = modulesSnap.docs.map((m) => m.id);

        const studentSet = new Set<string>();
        for (const moduleId of moduleIds) {
          try {
            const rosterSnap = await getDocs(collection(db, `moduleRosters/${moduleId}/students`));
            rosterSnap.forEach((s) => studentSet.add(String(s.data().studentNumber || s.id)));
          } catch (e) {
            // Ignore if no roster
          }
          try {
            const studentsSnap = await getDocs(collection(db, `moduleStudents/${moduleId}/students`));
            studentsSnap.forEach((s) => studentSet.add(String(s.data().studentNumber || s.id)));
          } catch (e) {
            // Ignore if no student records
          }
        }
        
        const total = studentSet.size;
        setTotalStudents(total || null);

        const sessionsCount = docs.length || 0;
        if (total > 0 && sessionsCount > 0) {
          const possible = total * sessionsCount;
          const rate = Math.round((totalSubmissions / possible) * 100);
          setAttendanceRate(Number.isFinite(rate) ? rate : null);
        } else {
          setAttendanceRate(null);
        }
      } catch (err) {
        console.error("Error fetching student data:", err);
        setTotalStudents(null);
        setAttendanceRate(null);
      }
    });

    return () => unsub();
  }, [user]);

  // Simulate notification count (could be replaced with real notifications)
  // Real notifications listener (unread count)
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | null = null;
    try {
      const notRef = collection(db, 'notifications');
      const q = query(notRef, where('userId', '==', user.uid), where('read', '==', false), orderBy('createdAt', 'desc'));
      unsub = onSnapshot(q, (snap) => {
        setNotifications(snap.size || 0);
      }, (err) => {
        console.error('notifications listener error', err);
      });
    } catch (e) {
      console.error('failed to start notifications listener', e);
    }
    return () => { if (unsub) unsub(); };
  }, [user]);

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      navigate("/login");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Delegate mode banner */}
      {getDelegateMode() && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-100 border-b border-yellow-200 text-yellow-900 p-3 flex items-center justify-between">
          <div className="text-sm">You are in Delegated Mode — acting on behalf of another lecturer</div>
          <div className="flex items-center gap-2">
            <button onClick={() => { clearDelegateMode(); window.location.href = '/settings/shared-access'; }} className="rounded-full border px-3 py-1 text-sm">Exit</button>
          </div>
        </div>
      )}
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-gray-900">
        <div className="p-6 border-b border-gray-800">
          <button 
            onClick={() => navigate("/")} 
            className="text-left group"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400 group-hover:text-gray-300 transition-colors">
              RollCall
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              Lecturer Console
            </div>
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} />
          ))}
        </nav>
        
        <div className="p-6 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {(() => {
                    const name = user?.displayName || user?.email || "";
                    const words = String(name).split(/\s+/).filter(Boolean);
                    if (words.length === 0) return "U";
                    if (words.length === 1) return String(words[0].charAt(0)).toUpperCase();
                    return (String(words[0].charAt(0)) + String(words[1].charAt(0))).toUpperCase();
                  })()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.displayName || user?.email}
                </p>
              <p className="text-xs text-gray-400 truncate">
                Lecturer
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
          
          <p className="mt-4 text-xs text-gray-500">
            &copy; {new Date().getFullYear()} RollCall v1.0.0
          </p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Mobile Header (sticky) */}
        <header className="lg:hidden sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Menu className="h-5 w-5 text-gray-600" />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-gray-900">{currentPage}</h1>
                <p className="text-xs text-gray-500">
                  {user?.displayName || user?.email}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/notifications')} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell className="h-4 w-4 text-gray-600" />
                {notifications > 0 && (
                  <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
                )}
              </button>
              <ProfileMenu />
              <button
                onClick={() => navigate("/sessions/new")}
                className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-1"
              >
                <PlayCircle className="h-4 w-4" />
                <span className="hidden xs:inline">Start</span>
              </button>
            </div>
          </div>
        </header>

        {/* Desktop Header */}
        {!hideHeader && (
          <header className="hidden lg:block bg-white border-b border-gray-200 sticky top-0 z-40">
            <div className="px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {currentPage}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Welcome back, {user?.displayName || user?.email}
                  </p>
                </div>
                
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-xs font-medium text-green-700">System Online</span>
                  </div>
                  
                      <button onClick={() => navigate('/notifications')} className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <Bell className="h-4 w-4 text-gray-600" />
                        {notifications > 0 && (
                          <span className="absolute top-1 right-1 h-2 w-2 bg-red-500 rounded-full" />
                        )}
                      </button>
                  
                  <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                    <HelpCircle className="h-4 w-4 text-gray-600" />
                  </button>
                  
                  <button
                    onClick={() => navigate("/sessions/new")}
                    className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                  >
                    <PlayCircle className="h-4 w-4" />
                    New Session
                  </button>
                  
                  <ProfileMenu />
                </div>
              </div>
              
              {/* Compact quick stats row - only show on Dashboard */}
              {currentPage === "Dashboard" && (
                <div className="mt-4 flex items-center gap-3">
                  {/* compact stat item */}
                  {/** small reusable compact stat visual */}
                  <div className="inline-flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-gray-100 p-2">
                        <Activity className="h-4 w-4 text-gray-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Active</div>
                        <div className="text-sm font-semibold text-gray-900">{activeCount ?? '—'}</div>
                      </div>
                    </div>
                    <div className="h-6 w-px bg-gray-200 mx-2" />
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-gray-100 p-2">
                        <Calendar className="h-4 w-4 text-gray-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Today</div>
                        <div className="text-sm font-semibold text-gray-900">{classesToday ?? '—'}</div>
                      </div>
                    </div>
                    <div className="h-6 w-px bg-gray-200 mx-2" />
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-gray-100 p-2">
                        <BookOpen className="h-4 w-4 text-gray-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Students</div>
                        <div className="text-sm font-semibold text-gray-900">{totalStudents ?? '—'}</div>
                      </div>
                    </div>
                    <div className="h-6 w-px bg-gray-200 mx-2" />
                    <div className="flex items-center gap-2">
                      <div className="rounded-md bg-gray-100 p-2">
                        <BarChart3 className="h-4 w-4 text-gray-700" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">Attendance</div>
                        <div className="text-sm font-semibold text-gray-900">{attendanceRate !== null ? `${attendanceRate}%` : '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <main className="flex-1 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Mobile Menu */}
      <MobileMenu isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}

export default LecturerShell;