// @ts-nocheck
import { Route, Routes } from "react-router-dom";
import LecturerRoutes from "./routes/LecturerRoutes";
import StudentRoutes from "./routes/StudentRoutes";

function App() {
  return (
    <Routes>
      <Route path="/*" element={<LecturerRoutes />} />
      <Route path="/s/*" element={<StudentRoutes />} />
    </Routes>
  );
}

export default App;
