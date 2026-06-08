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

function formatSeriesDate(value, period) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  if (period === "MONTHLY") {
    return date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      year: "2-digit",
    });
  }

  if (period === "WEEKLY") {
    return `Wk ${date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
    })}`;
  }

  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
  });
}

function safePercent(part, total) {
  const p = Number(part) || 0;
  const t = Number(total) || 0;
  if (!t) return 0;
  return Math.round((p / t) * 100);
}

function stackedWidth(value, total) {
  const percent = safePercent(value, total);
  return percent <= 0 ? "0%" : `${Math.max(percent, 4)}%`;
}

export default function WorkforceDashboardPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
  const trendPeriod = useWorkforceStore((s) => s.trendPeriod);
  const setTrendPeriod = useWorkforceStore((s) => s.setTrendPeriod);
  const summary = useWorkforceStore((s) => s.summary);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchSummary = useWorkforceStore((s) => s.fetchSummary);

  useEffect(() => {
    fetchSummary?.();
  }, [fetchSummary, workforceDate, group, trendPeriod]);

  const totalPeople = Number(summary?.totalPeople) || 0;
  const countedDays = Number(summary?.countedDays) || 0;
  const over8 = Number(summary?.greaterThan8Hours) || 0;
  const over10 = Number(summary?.greaterThan10Hours) || 0;
  const over12 = Number(summary?.greaterThan12Hours) || 0;
  const over8Pct = safePercent(over8, totalPeople);
  const over10Pct = safePercent(over10, totalPeople);
  const over12Pct = safePercent(over12, totalPeople);
  const series = Array.isArray(summary?.timeSeries) ? summary.timeSeries : [];
  const maxPopulation = Math.max(...series.map((row) => Number(row.population) || 0), 1);

  const controls = (
    <>
      <label className="summary-filter-field">
        <span>Date</span>
        <input
          className="summary-input"
          type="date"
          value={workforceDate}
          onChange={(e) => setWorkforceDate(e.target.value)}
        />
      </label>

      <label className="summary-filter-field summary-filter-small-wide">
        <span>Series</span>
        <select
          className="summary-input"
          value={trendPeriod}
          onChange={(e) => setTrendPeriod(e.target.value)}
        >
          <option value="DAILY">Daily</option>
          <option value="WEEKLY">Weekly</option>
          <option value="MONTHLY">Monthly</option>
        </select>
      </label>

      <label className="summary-filter-field">
        <span>Group</span>
        <select
          className="summary-input"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="ALL">All Workforce</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>
      </label>

      <button className="summary-refresh-btn" onClick={fetchSummary} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </>
  );

  return (
    <AppShell
      title="Workforce Monitoring Overview"
      subtitle="Population counts anyone who entered. Working-day count requires more than 4 hours."
      summaryControls={controls}
      summaryStats={[
        { value: totalPeople, label: "TOTAL WORKFORCE" },
        { value: countedDays, label: "COUNTED DAYS", variant: "green" },
        { value: over8, label: "> 8 HOURS", variant: "amber" },
        { value: over12, label: "12+ HOURS", variant: "red" },
      ]}
    >
      <section className="center-panel workforce-full-span no-panel-bg">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="kpi-grid compact-kpi-grid">
          <div className="metric-card kpi-card kpi-total">
            <div className="metric-label">Total Workforce</div>
            <div className="metric-value">{totalPeople}</div>
            <div className="mini-info-text">Anyone with an entry scan in the workforce window.</div>
          </div>

          <div className="metric-card kpi-card status-green">
            <div className="metric-label">Counted Working Days</div>
            <div className="metric-value">{countedDays}</div>
            <div className="mini-info-text">Only more than 4 hours counts as one day.</div>
          </div>

          <div className="metric-card kpi-card status-amber">
            <div className="metric-label">Greater Than 8 Hours</div>
            <div className="metric-value">{over8}</div>
            <div className="mini-info-text">{over8Pct}% of total workforce.</div>
          </div>

          <div className="metric-card kpi-card status-red">
            <div className="metric-label">12 Hours and Above</div>
            <div className="metric-value">{over12}</div>
            <div className="mini-info-text">{over12Pct}% high-hour exposure.</div>
          </div>
        </div>

        <div className="dashboard-main-grid dashboard-timeseries-grid dashboard-timeseries-wide">
          <div className="chart-card compliance-overview-card">
            <div className="chart-header-row">
              <div>
                <h3>Working Hours Risk</h3>
                <p>Risk buckets are based on actual first scan to last scan.</p>
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
                <div className="progress-track"><div className="progress-fill fill-orange" style={{ width: `${over10Pct}%` }} /></div>
              </div>
              <div className="progress-row">
                <div className="progress-label"><span>12 Hours and Above</span><b>{over12}</b></div>
                <div className="progress-track"><div className="progress-fill fill-red" style={{ width: `${over12Pct}%` }} /></div>
              </div>
            </div>
          </div>

          <div className="chart-card time-series-card stacked-timeseries-card">
            <div className="chart-header-row">
              <div>
                <h3>Working Hours Time Series</h3>
                <p>Stacked by hours bucket. Highest axis uses total workforce for the period.</p>
              </div>
              <span className="soft-pill">{trendPeriod}</span>
            </div>

            <div className="stacked-chart-wrap">
              {series.map((row) => {
                const population = Number(row.population) || 0;
                const hours8OrLess = Number(row.hours_8_or_less) || 0;
                const hours8To10 = Number(row.hours_8_10) || 0;
                const hours10To12 = Number(row.hours_10_12) || 0;
                const hours12Plus = Number(row.hours_12_plus) || 0;
                const barWidth = stackedWidth(population, maxPopulation);

                return (
                  <div className="stacked-chart-row" key={row.period_start}>
                    <div className="stacked-chart-label">{formatSeriesDate(row.period_start, trendPeriod)}</div>
                    <div className="stacked-chart-axis">
                      <div className="stacked-bar" style={{ width: barWidth }}>
                        <div className="stack-segment stack-green" style={{ width: stackedWidth(hours8OrLess, population) }} title="8 hours and below" />
                        <div className="stack-segment stack-yellow" style={{ width: stackedWidth(hours8To10, population) }} title="8 to 10 hours" />
                        <div className="stack-segment stack-orange" style={{ width: stackedWidth(hours10To12, population) }} title="10 to 12 hours" />
                        <div className="stack-segment stack-red" style={{ width: stackedWidth(hours12Plus, population) }} title="12 hours and above" />
                      </div>
                      <div className="series-line-dot" style={{ left: barWidth }} title={`Population ${population}`} />
                    </div>
                    <div className="stacked-chart-value">{population}</div>
                  </div>
                );
              })}

              {series.length === 0 && <div className="empty-cell">No time series data found.</div>}
            </div>

            <div className="stacked-legend">
              <span><i className="legend-box stack-green" /> ≤ 8 hrs</span>
              <span><i className="legend-box stack-yellow" /> &gt; 8 hrs</span>
              <span><i className="legend-box stack-orange" /> &gt; 10 hrs</span>
              <span><i className="legend-box stack-red" /> 12+ hrs</span>
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
