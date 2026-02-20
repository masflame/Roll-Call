// @ts-nocheck
import { Route, Routes } from "react-router-dom";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import Dashboard from "../pages/lecturer/Dashboard";
import Modules from "../pages/lecturer/Modules";
import CreateSession from "../pages/lecturer/CreateSession";
import Schedules from "../pages/lecturer/Schedules";
import SessionDisplay from "../pages/lecturer/SessionDisplay";
import SessionLive from "../pages/lecturer/SessionLive";
import History from "../pages/lecturer/History";
import SessionDetails from "../pages/lecturer/SessionDetails";
import Analytics from "../pages/lecturer/Analytics";
import ProtectedRoute from "../components/ProtectedRoute";
import Profile from "../pages/lecturer/Profile";
import LecturerShell from "../components/layout/LecturerShell";

function LecturerRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      {/* Public display route for projector/TV - no auth required */}
      <Route path="sessions/:sessionId/display" element={<SessionDisplay />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<LecturerShell />}>
          <Route index element={<Dashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Profile />} />
          <Route path="modules" element={<Modules />} />
          <Route path="sessions/new" element={<CreateSession />} />
          <Route path="schedules" element={<Schedules />} />
          <Route path="sessions/:sessionId/live" element={<SessionLive />} />
          <Route path="history" element={<History />} />
          <Route path="history/:sessionId" element={<SessionDetails />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default LecturerRoutes;
