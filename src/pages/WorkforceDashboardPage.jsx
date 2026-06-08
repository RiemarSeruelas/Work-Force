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

function buildLinePoints(rows, lineKey) {
  if (!rows.length) return "";

  const maxLine = Math.max(...rows.map((row) => Number(row[lineKey]) || 0), 1);
  const lastIndex = Math.max(rows.length - 1, 1);

  return rows
    .map((row, index) => {
      const value = Number(row[lineKey]) || 0;
      const x = (index / lastIndex) * 100;
      const y = 100 - (value / maxLine) * 88 - 6;
      return `${x},${Math.max(4, Math.min(96, y))}`;
    })
    .join(" ");
}

function VerticalTimeSeriesChart({ title, description, rows, period, segments, lineKey, lineLabel }) {
  const maxPopulation = Math.max(...rows.map((row) => Number(row.population) || 0), 1);
  const points = buildLinePoints(rows, lineKey);

  return (
    <div className="chart-card powerbi-timeseries-card">
      <div className="chart-header-row compact-chart-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="soft-pill">{lineLabel}</span>
      </div>

      <div className="powerbi-chart-area">
        <div className="powerbi-y-axis">
          <span>{maxPopulation}</span>
          <span>{Math.round(maxPopulation / 2)}</span>
          <span>0</span>
        </div>

        <div className="powerbi-plot">
          {points && (
            <svg className="powerbi-line-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
            </svg>
          )}

          {rows.map((row) => {
            const population = Number(row.population) || 0;
            const barHeight = population ? Math.max((population / maxPopulation) * 100, 4) : 0;

            return (
              <div className="powerbi-column" key={row.period_start}>
                <div className="powerbi-bar-slot">
                  <div className="powerbi-stacked-bar" style={{ height: `${barHeight}%` }}>
                    {segments.map((segment) => {
                      const value = Number(row[segment.key]) || 0;
                      const height = population ? (value / population) * 100 : 0;

                      return (
                        <div
                          key={segment.key}
                          className={`powerbi-segment ${segment.className}`}
                          style={{ height: `${height}%` }}
                          title={`${segment.label}: ${value}`}
                        />
                      );
                    })}
                  </div>
                </div>
                <div className="powerbi-x-label">{formatSeriesDate(row.period_start, period)}</div>
              </div>
            );
          })}

          {rows.length === 0 && <div className="empty-cell">No time series data found.</div>}
        </div>
      </div>

      <div className="powerbi-legend">
        {segments.map((segment) => (
          <span key={segment.key}><i className={`legend-box ${segment.className}`} /> {segment.label}</span>
        ))}
        <span><i className="line-legend" /> {lineLabel}</span>
      </div>
    </div>
  );
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
      subtitle="Population counts anyone who entered. Day count only applies when total time is more than 4 hours."
      summaryControls={controls}
      summaryStats={[
        { value: totalPeople, label: "TOTAL WORKFORCE" },
        { value: countedDays, label: "COUNTED DAYS", variant: "green" },
        { value: over8, label: "> 8 HOURS", variant: "amber" },
        { value: over12, label: "12+ HOURS", variant: "red" },
      ]}
    >
      <section className="center-panel workforce-full-span no-panel-bg overview-page-fit">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="kpi-grid compact-kpi-grid overview-kpi-grid">
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

        <div className="overview-timeseries-stack">
          <VerticalTimeSeriesChart
            title="Working Hours Compliance"
            description="Stacked population by work-hour bucket with an average-hours line."
            rows={series}
            period={trendPeriod}
            lineKey="average_hours"
            lineLabel="Average Working Hours"
            segments={[
              { key: "hours_8_or_less", label: "< 8 hours", className: "stack-green" },
              { key: "hours_8_10", label: "> 8 hours", className: "stack-yellow" },
              { key: "hours_10_12", label: "> 10 hours", className: "stack-orange" },
              { key: "hours_12_plus", label: "12+ hours", className: "stack-red" },
            ]}
          />

          <VerticalTimeSeriesChart
            title="Working Days Compliance"
            description="More than 4 hours counts as one day. Stacked by number of counted days."
            rows={series}
            period={trendPeriod}
            lineKey="average_days"
            lineLabel="Average Working Days"
            segments={[
              { key: "days_5_or_less", label: "5 days and below", className: "stack-green" },
              { key: "days_6", label: "6 days", className: "stack-blue" },
              { key: "days_over_6", label: "Greater than 6 days", className: "stack-navy" },
            ]}
          />
        </div>

        <div className="overview-bottom-strip">
          <div className="chart-card scan-card compact-scan-card">
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

          <div className="chart-card compact-risk-card">
            <div className="chart-header-row compact-chart-header">
              <div>
                <h3>Current Day Risk</h3>
                <p>Same-day risk buckets from first scan to last scan.</p>
              </div>
              <span className="soft-pill">{group}</span>
            </div>
            <div className="mini-risk-grid">
              <div><span>&gt; 8 Hrs</span><b>{over8}</b><small>{over8Pct}%</small></div>
              <div><span>&gt; 10 Hrs</span><b>{over10}</b><small>{over10Pct}%</small></div>
              <div><span>12+ Hrs</span><b>{over12}</b><small>{over12Pct}%</small></div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
