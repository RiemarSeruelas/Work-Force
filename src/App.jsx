import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import PasscodePage from "./pages/PasscodePage.jsx";
import WorkforceDashboardPage from "./pages/WorkforceDashboardPage.jsx";
import WorkforceDailyRecordPage from "./pages/WorkforceDailyRecordPage.jsx";
import WorkforceCompliancePage from "./pages/WorkforceCompliancePage.jsx";
import WorkforcePopulationPage from "./pages/WorkforcePopulationPage.jsx";
import WorkforceMapPage from "./pages/WorkforceMapPage.jsx";

const USAGE_SESSION_KEY = "workforce-usage-session-id";
const USAGE_RECORDED_KEY = "workforce-usage-recorded-session";
let usageRequestStarted = false;

console.log(
  "%cMade by Riemar R. Seruelas Jr - Data Digital Intern",
  "color: #087cff; font-family: Consolas, monospace; font-size: 13px; font-weight: 700;"
);

function getUsageSessionId() {
  const existingSessionId = sessionStorage.getItem(USAGE_SESSION_KEY);
  if (existingSessionId) return existingSessionId;

  const generatedSessionId =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

  sessionStorage.setItem(USAGE_SESSION_KEY, generatedSessionId);
  return generatedSessionId;
}

export default function App() {
  useEffect(() => {
    const sessionId = getUsageSessionId();

    if (
      usageRequestStarted ||
      sessionStorage.getItem(USAGE_RECORDED_KEY) === sessionId
    ) {
      return;
    }

    usageRequestStarted = true;

    fetch("/api/usage/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId,
        page: `${window.location.pathname}${window.location.search}`,
        referrer: document.referrer || "direct",
      }),
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) throw new Error(`Usage log returned ${response.status}`);
        sessionStorage.setItem(USAGE_RECORDED_KEY, sessionId);
      })
      .catch((error) => {
        usageRequestStarted = false;
        console.warn("Usage visit was not recorded:", error.message);
      });
  }, []);

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

        <Route
          path="/workforce/fte-compliance"
          element={<Navigate to="/workforce/compliance" replace />}
        />
        <Route
          path="/workforce/contractor-compliance"
          element={<Navigate to="/workforce/compliance" replace />}
        />

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
            <ProtectedRoute>
              <WorkforceMapPage />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to="/workforce" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
