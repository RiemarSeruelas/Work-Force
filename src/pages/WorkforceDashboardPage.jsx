import { useEffect } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function formatDateTime(value) {
  if (!value) return "No scan yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    dateStyle: "medium",
    timeStyle: "medium",
  });
}

export default function WorkforceDashboardPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
  const summary = useWorkforceStore((s) => s.summary);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchSummary = useWorkforceStore((s) => s.fetchSummary);

  useEffect(() => {
    fetchSummary?.();
  }, [fetchSummary, workforceDate, group]);

  return (
    <AppShell
      title="Daily Workforce Monitoring"
      subtitle="Live workforce accounting based on the current 6 AM workforce day"
      summaryStats={[
        { value: summary?.totalPeople ?? 0, label: "PEOPLE" },
        { value: summary?.greaterThan8Hours ?? 0, label: "> 8 HOURS", variant: "amber" },
        { value: summary?.greaterThan10Hours ?? 0, label: "> 10 HOURS", variant: "red" },
        { value: summary?.avgWorkHours ?? 0, label: "AVG HOURS", variant: "green" },
      ]}
    >
      <aside className="panel left-panel">
        <div className="panel-title">Filters</div>
        <label className="field-label">Workforce Date</label>
        <input
          className="styled-input"
          type="date"
          value={workforceDate}
          onChange={(e) => setWorkforceDate(e.target.value)}
        />

        <label className="field-label">Group</label>
        <select className="styled-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="ALL">All Workforce</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>

        <button className="primary-action-btn" onClick={fetchSummary} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>

        {error && <div className="error-box">{error}</div>}
      </aside>

      <section className="panel center-panel workforce-center-span">
        <div className="dashboard-grid">
          <div className="metric-card large-metric">
            <div className="metric-label">Current Workforce Day</div>
            <div className="metric-value">{workforceDate}</div>
            <div className="mini-info-text">Window: 6:00 AM to 5:59 AM next day</div>
          </div>

          <div className="metric-card large-metric">
            <div className="metric-label">Latest Scan</div>
            <div className="metric-value small-value">{formatDateTime(summary?.latestScan)}</div>
          </div>

          <div className="metric-card status-green">
            <div className="metric-label">People Accounted</div>
            <div className="metric-value">{summary?.totalPeople ?? 0}</div>
          </div>

          <div className="metric-card status-amber">
            <div className="metric-label">Greater than 8 Hours</div>
            <div className="metric-value">{summary?.greaterThan8Hours ?? 0}</div>
          </div>

          <div className="metric-card status-red">
            <div className="metric-label">Greater than 10 Hours</div>
            <div className="metric-value">{summary?.greaterThan10Hours ?? 0}</div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
