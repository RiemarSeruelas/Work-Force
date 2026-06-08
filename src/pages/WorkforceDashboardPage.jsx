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

function safePercent(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (!t) return 0;
  return Math.round((p / t) * 100);
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

  const totalPeople = Number(summary?.totalPeople) || 0;
  const over8 = Number(summary?.greaterThan8Hours) || 0;
  const over10 = Number(summary?.greaterThan10Hours) || 0;
  const avgHours = Number(summary?.avgWorkHours) || 0;
  const over8Pct = safePercent(over8, totalPeople);
  const over10Pct = safePercent(over10, totalPeople);

  return (
    <AppShell
      title="Daily Workforce Monitoring"
      subtitle="Live workforce accounting based on the current 6 AM workforce day"
      summaryStats={[
        { value: totalPeople, label: "POPULATION" },
        { value: over8, label: "> 8 HOURS", variant: "amber" },
        { value: over10, label: "> 10 HOURS", variant: "red" },
        { value: avgHours, label: "AVG HOURS", variant: "green" },
      ]}
    >
      <aside className="panel left-panel filter-panel">
        <div className="panel-title">Control Panel</div>

        <label className="field-label">Workforce Date</label>
        <input
          className="styled-input"
          type="date"
          value={workforceDate}
          onChange={(e) => setWorkforceDate(e.target.value)}
        />

        <label className="field-label">Workforce Group</label>
        <select className="styled-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="ALL">All Workforce</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>

        <button className="primary-action-btn" onClick={fetchSummary} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh Dashboard"}
        </button>

        <div className="note-card">
          <div className="note-title">Current Window</div>
          <div className="note-text">{workforceDate} 06:00 AM until next day 05:59 AM.</div>
        </div>

        {error && <div className="error-box">{error}</div>}
      </aside>

      <section className="center-panel workforce-center-span no-panel-bg">
        <div className="kpi-grid">
          <div className="metric-card kpi-card kpi-total">
            <div className="metric-label">Total Workforce</div>
            <div className="metric-value">{totalPeople}</div>
            <div className="mini-info-text">People detected in selected workforce day</div>
          </div>

          <div className="metric-card kpi-card status-amber">
            <div className="metric-label">Greater Than 8 Hours</div>
            <div className="metric-value">{over8}</div>
            <div className="mini-info-text">{over8Pct}% of current population</div>
          </div>

          <div className="metric-card kpi-card status-red">
            <div className="metric-label">Greater Than 10 Hours</div>
            <div className="metric-value">{over10}</div>
            <div className="mini-info-text">{over10Pct}% of current population</div>
          </div>

          <div className="metric-card kpi-card status-green">
            <div className="metric-label">Average Working Hours</div>
            <div className="metric-value">{avgHours}</div>
            <div className="mini-info-text">Based on first and last scan</div>
          </div>
        </div>

        <div className="dashboard-main-grid">
          <div className="chart-card compliance-overview-card">
            <div className="chart-header-row">
              <div>
                <h3>Working Hours Compliance</h3>
                <p>Quick view for overtime risk and high-hour exposure.</p>
              </div>
              <span className="soft-pill">{group}</span>
            </div>

            <div className="progress-stack">
              <div className="progress-row">
                <div className="progress-label"><span>&gt; 8 Hours</span><b>{over8}</b></div>
                <div className="progress-track"><div className="progress-fill fill-amber" style={{ width: `${over8Pct}%` }} /></div>
              </div>
              <div className="progress-row">
                <div className="progress-label"><span>&gt; 10 Hours</span><b>{over10}</b></div>
                <div className="progress-track"><div className="progress-fill fill-red" style={{ width: `${over10Pct}%` }} /></div>
              </div>
              <div className="progress-row">
                <div className="progress-label"><span>Normal / Below Threshold</span><b>{Math.max(totalPeople - over8, 0)}</b></div>
                <div className="progress-track"><div className="progress-fill fill-green" style={{ width: `${safePercent(Math.max(totalPeople - over8, 0), totalPeople)}%` }} /></div>
              </div>
            </div>
          </div>

          <div className="chart-card scan-card">
            <h3>Latest Scan</h3>
            <div className="latest-scan-value">{formatDateTime(summary?.latestScan)}</div>
            <div className="scan-meta-grid">
              <div>
                <span>Workforce Date</span>
                <b>{workforceDate}</b>
              </div>
              <div>
                <span>Shift Window</span>
                <b>06:00 - 05:59</b>
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
