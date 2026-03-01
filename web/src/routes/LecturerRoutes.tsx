// @ts-nocheck
import { Route, Routes } from "react-router-dom";
import Login from "../pages/auth/Login";
import Register from "../pages/auth/Register";
import CompleteSignup from "../pages/auth/CompleteSignup";
import ResetPassword from "../pages/auth/ResetPassword";
import Dashboard from "../pages/lecturer/Dashboard";
import Modules from "../pages/lecturer/Modules";
import ManageModules from "../pages/lecturer/ManageModules";
import ManageOfferings from "../pages/lecturer/ManageOfferings";
import ManageGroups from "../pages/lecturer/ManageGroups";
import CreateSession from "../pages/lecturer/CreateSession";
import Schedules from "../pages/lecturer/Schedules";
import SessionDisplay from "../pages/lecturer/SessionDisplay";
import SessionLive from "../pages/lecturer/SessionLive";
import History from "../pages/lecturer/History";
import SessionDetails from "../pages/lecturer/SessionDetails";
import Analytics from "../pages/lecturer/Analytics";
import ProtectedRoute from "../components/ProtectedRoute";
import Profile from "../pages/lecturer/Profile";
import ComplianceExports from "../pages/lecturer/ComplianceExports";
import AccountSettings from "../pages/lecturer/AccountSettings";
import Notifications from "../pages/lecturer/Notifications";
import SharedAccess from "../pages/lecturer/SharedAccess";
import SharedAccessDelegate from "../pages/lecturer/SharedAccessDelegate";
import SharedAccessManage from "../pages/lecturer/SharedAccessManage";
import AcceptInvite from "../pages/auth/AcceptInvite";
import LecturerShell from "../components/layout/LecturerShell";

function LecturerRoutes() {
  return (
    <Routes>
      <Route path="login" element={<Login />} />
      <Route path="register" element={<Register />} />
      <Route path="complete-signup" element={<CompleteSignup />} />
      <Route path="reset-password" element={<ResetPassword />} />
      {/* Public display route for projector/TV - no auth required */}
      <Route path="sessions/:sessionId/display" element={<SessionDisplay />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<LecturerShell />}>
          <Route index element={<Dashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Profile />} />
          <Route path="settings/account" element={<AccountSettings />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings/shared-access" element={<SharedAccess />} />
          <Route path="settings/shared-access/delegate/:accessId" element={<SharedAccessDelegate />} />
          <Route path="settings/shared-access/manage/:accessId" element={<SharedAccessManage />} />
          <Route path="settings/compliance" element={<ComplianceExports />} />
          <Route path="accept-invite" element={<AcceptInvite />} />
          <Route path="modules" element={<Modules />} />
          <Route path="modules/manage" element={<ManageModules />} />
          <Route path="offerings/manage" element={<ManageOfferings />} />
          <Route path="groups/manage" element={<ManageGroups />} />
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
