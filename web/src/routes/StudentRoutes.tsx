// @ts-nocheck
import { Route, Routes } from "react-router-dom";
import ScanForm from "../pages/student/ScanForm";
import Success from "../pages/student/Success";

function StudentRoutes() {
  return (
    <Routes>
      <Route path=":sessionId" element={<ScanForm />} />
      <Route path=":sessionId/success" element={<Success />} />
    </Routes>
  );
}

export default StudentRoutes;
