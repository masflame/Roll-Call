// // @ts-nocheck
// import { ReactNode } from "react";
// import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
// import { auth } from "../../firebase";
// import ProfileMenu from "../ProfileMenu";

// interface NavItem {
//   label: string;
//   to: string;
// }

// const navItems: NavItem[] = [
//   { label: "Dashboard", to: "/" },
//   { label: "Modules", to: "/modules" },
//     { label: "Sessions", to: "/sessions/new" },
//     { label: "Analytics", to: "/analytics" },
//   { label: "History", to: "/history" },
//   { label: "Settings", to: "/settings" }
// ];

// function NavLinkItem({ label, to }: NavItem) {
//   return (
//     <NavLink
//       to={to}
//       end={to !== "/sessions/new"}
//       className={({ isActive }) => [
//         "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition",
//         isActive ? "bg-white/15 text-text-onBrand" : "text-text-onBrand/70 hover:bg-white/8 hover:text-text-onBrand"
//       ].join(" ")}
//     >
//       {({ isActive }) => (
//         <>
//           <span
//             className={[
//               "h-2 w-2 rounded-full transition",
//               isActive ? "bg-white" : "bg-white/40 group-hover:bg-white"
//             ].join(" ")}
//           />
//           {label}
//         </>
//       )}
//     </NavLink>
//   );
// }

// function HeaderAction({ children }: { children?: ReactNode }) {
//   if (!children) return null;
//   return <div className="flex flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">{children}</div>;
// }

// function LecturerShell() {
//   const navigate = useNavigate();
//   const user = auth.currentUser;
//   const location = useLocation();
//   const hideHeader = /^\/sessions\/[\w-]+\/live$/.test(location.pathname);

//   return (
//     <div className="min-h-screen bg-canvas text-text-primary">
//       <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-brand-primary text-text-onBrand shadow-subtle brand-banner">
//         <div className="px-6 pb-6 pt-8">
//           <button onClick={() => navigate("/")} aria-label="Home" className="text-left">
//             <div className="text-xs font-semibold uppercase tracking-[0.45em] text-text-onBrand/60">RollCall</div>
//             <div className="mt-2 text-xl font-semibold text-text-onBrand">Lecturer Console</div>
//           </button>
//         </div>
//         <nav className="flex-1 space-y-1 px-4 py-4">
//           {navItems.map((item) => (
//             <NavLinkItem key={item.to} {...item} />
//           ))}
//         </nav>
//         <div className="px-6 pb-6 pt-4 text-xs text-text-onBrand/50">
//           &copy; {new Date().getFullYear()} RollCall
//         </div>
//       </aside>
//       <div className="flex flex-col lg:ml-64 min-h-screen">
//         {/* mobile topbar */}
//         <div className="flex items-center justify-between border-b border-stroke-subtle bg-surface px-4 py-3 lg:hidden">
//           <div>
//             <button onClick={() => navigate("/")} className="text-left">
//               <div className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-primary/70">RollCall</div>
//               <div className="text-sm font-semibold">{user?.displayName || user?.email}</div>
//             </button>
//           </div>
//             <div className="flex items-center gap-2">
//               <ProfileMenu />
//               <button onClick={() => navigate('/profile')} className="hidden sm:inline-flex items-center gap-2 rounded-md border border-stroke-subtle px-3 py-1 text-sm text-text-muted hover:bg-surfaceAlt">Profile</button>
//               <button onClick={() => navigate('/sessions/new')} className="rounded-md bg-brand-primary px-3 py-1 text-sm text-text-onBrand">Start</button>
//             </div>
//         </div>
//         {!hideHeader && (
//           <header className="hidden lg:flex border-b border-stroke-subtle bg-surface px-8 py-5">
//             <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between w-full">
//               <div>
//                 <p className="text-xs font-semibold uppercase tracking-[0.35em] text-brand-primary/70">Lecturer Workspace</p>
//                 <p className="mt-1 text-xl font-semibold text-text-primary">{user?.displayName || user?.email}</p>
//                 <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-stroke-subtle bg-surfaceAlt px-3 py-1 text-xs font-medium text-text-muted">
//                   <span className="h-2 w-2 rounded-full bg-accent-success" />
//                   Active session monitoring
//                 </div>
//               </div>
//               <HeaderAction>
//                 <button
//                   type="button"
//                   className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-text-onBrand shadow-brand transition hover:bg-brand-primary/90"
//                   onClick={() => navigate("/sessions/new")}
//                 >
//                   Start Session
//                 </button>
//                 <ProfileMenu />
//               </HeaderAction>
//             </div>
//           </header>
//         )}
//         <main className="flex-1 overflow-y-auto bg-canvasAlt px-8 py-8">
//           <Outlet />
//         </main>
//       </div>
//     </div>
//   );
// }

// export default LecturerShell;

// @ts-nocheck
import { ReactNode, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { auth } from "../../firebase";
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
  Calendar
} from "lucide-react";
import { useState } from "react";

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
      end={item.to === "/"}
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
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-white" />
          )}
        </>
      )}
    </NavLink>
  );
}

interface HeaderActionProps {
  children?: ReactNode;
}

function HeaderAction({ children }: HeaderActionProps) {
  if (!children) return null;
  return <div className="flex items-center gap-3">{children}</div>;
}

function MobileMenu({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Menu panel */}
      <div className="fixed left-0 top-0 bottom-0 w-64 bg-brand-primary p-6 shadow-xl">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => {
              navigate("/");
              onClose();
            }} 
            className="text-left"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-white/60">
              RollCall
            </div>
            <div className="mt-1 text-lg font-semibold text-white">
              Lecturer Console
            </div>
          </button>
          <button 
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-white/10 transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>
        
        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} onClick={onClose} />
          ))}
        </nav>
        
        <div className="absolute bottom-6 left-6 right-6 text-xs text-white/50">
          &copy; {new Date().getFullYear()} RollCall
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
  
  // Hide header on live session pages
  const hideHeader = /^\/sessions\/[\w-]+\/live$/.test(location.pathname);
  
  // Get current page title
  const currentPage = navItems.find(item => 
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
  )?.label || "Dashboard";

  // compute live stats for header
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
      const startOfDay = new Date(); startOfDay.setHours(0,0,0,0);
      const endOfDay = new Date(); endOfDay.setHours(23,59,59,999);
      const todayCount = docs.filter((d) => {
        const when = d.scheduledAt?.toDate ? d.scheduledAt.toDate() : d.scheduledAt ? new Date(d.scheduledAt) : (d.createdAt?.toDate ? d.createdAt.toDate() : d.createdAt ? new Date(d.createdAt) : null);
        if (!when) return false;
        return when.getTime() >= startOfDay.getTime() && when.getTime() <= endOfDay.getTime();
      }).length;
      setClassesToday(todayCount);

      // total submissions across sessions
      const totalSubmissions = docs.reduce((acc, d) => acc + (d.stats?.submissionsCount || 0), 0);

      // compute total students by aggregating module rosters
      try {
        const modulesRef = collection(db, "modules");
        const modulesSnap = await getDocs(query(modulesRef, where("lecturerId", "==", user.uid)));
        const moduleIds = modulesSnap.docs.map((m) => m.id);

        const studentSet = new Set<string>();
        for (const moduleId of moduleIds) {
          try {
            const rosterSnap = await getDocs(collection(db, `moduleRosters/${moduleId}/students`));
            rosterSnap.forEach((s) => studentSet.add(String(s.data().studentNumber || s.id)));
          } catch (e) {}
          try {
            const studentsSnap = await getDocs(collection(db, `moduleStudents/${moduleId}/students`));
            studentsSnap.forEach((s) => studentSet.add(String(s.data().studentNumber || s.id)));
          } catch (e) {}
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
        setTotalStudents(null);
        setAttendanceRate(null);
      }
    });

    return () => unsub();
  }, [user]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 flex-col bg-gray-900">
        <div className="p-6">
          <button 
            onClick={() => navigate("/")} 
            className="text-left group"
          >
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-400 group-hover:text-gray-300 transition-colors">
              RollCall
            </div>
            <div className="mt-2 text-xl font-semibold text-white">
              Lecturer Console2
            </div>
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-2">
          {navItems.map((item) => (
            <NavLinkItem key={item.to} item={item} />
          ))}
        </nav>
        
        <div className="p-6 text-xs text-gray-500 border-t border-gray-800">
          <p>&copy; {new Date().getFullYear()} RollCall</p>
          <p className="mt-1">v1.0.0</p>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-64 min-h-screen flex flex-col">
        {/* Mobile Header (sticky) */}
        <header className="lg:hidden sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
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
              <ProfileMenu />
              <button
                onClick={() => navigate("/sessions/new")}
                className="bg-gray-900 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
              >
                Start
              </button>
            </div>
          </div>
        </header>

        {/* Desktop Header */}
        {!hideHeader && (
          <header className="hidden lg:block bg-white border-b border-gray-200">
            <div className="px-8 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-semibold text-gray-900">
                    {currentPage}
                  </h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Welcome back, {user?.displayName || user?.email}
                  </p>
                </div>
                
                <HeaderAction>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg">
                      <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-xs font-medium text-green-700">System Online</span>
                    </div>
                    
                    <button
                      onClick={() => navigate("/sessions/new")}
                      className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                    >
                      <PlayCircle className="h-4 w-4" />
                      New Session
                    </button>
                    
                    <ProfileMenu />
                  </div>
                </HeaderAction>
              </div>
              
              {/* Quick stats row */}
              <div className="mt-6 grid grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Active Sessions</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{activeCount ?? "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Classes Today</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{classesToday ?? "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Total Students</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{totalStudents ?? "—"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Attendance Rate</p>
                  <p className="text-lg font-semibold text-gray-900 mt-1">{attendanceRate !== null ? `${attendanceRate}%` : "—"}</p>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <main className="flex-1 bg-gray-50 p-4 lg:p-8 pt-16 lg:pt-0">
          <div className="max-w-7xl mx-auto">
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