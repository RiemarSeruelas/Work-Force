import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PasscodePage from "./pages/PasscodePage.jsx";
import WorkforceDashboardPage from "./pages/WorkforceDashboardPage.jsx";
import WorkforceDailyRecordPage from "./pages/WorkforceDailyRecordPage.jsx";
import WorkforceCompliancePage from "./pages/WorkforceCompliancePage.jsx";
import WorkforcePopulationPage from "./pages/WorkforcePopulationPage.jsx";
import WorkforceMapPage from "./pages/WorkforceMapPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/passcode" element={<PasscodePage />} />

        <Route
          path="/workforce"
          element={
            <ProtectedRoute>
              <WorkforceDashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/workforce/daily-record"
          element={
            <ProtectedRoute>
              <WorkforceDailyRecordPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/workforce/compliance"
          element={
            <ProtectedRoute>
              <WorkforceCompliancePage group="ALL" />
            </ProtectedRoute>
          }
        />

        <Route path="/workforce/fte-compliance" element={<Navigate to="/workforce/compliance" replace />} />
        <Route path="/workforce/contractor-compliance" element={<Navigate to="/workforce/compliance" replace />} />

        <Route
          path="/workforce/population"
          element={
            <ProtectedRoute>
              <WorkforcePopulationPage />
            </ProtectedRoute>
          }
        />

        <Route
  path="/workforce/map"
  element={
    <RequireAccess>
      <WorkforceMapPage />
    </RequireAccess>
  }
/>

        <Route path="/" element={<Navigate to="/workforce" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
