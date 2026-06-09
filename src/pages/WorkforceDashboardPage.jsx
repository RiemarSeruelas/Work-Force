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

function getIsoWeekNumber(date) {
  const temp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  return Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
}

function formatSeriesDate(value, period) {
  if (!value) return "-";
  const date = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return String(value);

  if (period === "MONTHLY") {
    // Monthly view should show only the month bucket, not the day number
    // and not a confusing year suffix like Jan 26.
    return date.toLocaleDateString("en-PH", {
      timeZone: "Asia/Manila",
      month: "short",
    });
  }

  if (period === "WEEKLY") {
    return `Week ${getIsoWeekNumber(date)}`;
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

function getSegmentTotal(row, segments) {
  return segments.reduce((sum, segment) => sum + (Number(row?.[segment.key]) || 0), 0);
}

function getStackedBarHeightPercent(value, maxValue) {
  const safeValue = Math.max(Number(value) || 0, 0);
  const safeMax = Math.max(Number(maxValue) || 0, 1);

  if (!safeValue) return 0;

  // The connector now follows only the visible stacked bar, not the whole plot.
  return Math.max((Math.min(safeValue, safeMax) / safeMax) * 100, 4);
}

 function buildTopOfBarLineSegments(rows, segments, maxVisibleTotal) {
  if (!rows.length) return [];

  const count = Math.max(rows.length, 1);
  const segmentsOut = [];
  let current = [];

  rows.forEach((row, index) => {
    const visibleTotal = getSegmentTotal(row, segments);

    // Do not pull the connector down to zero for empty buckets.
    // This was the reason the line looked wrecked when a period had no value.
    if (visibleTotal <= 0) {
      if (current.length > 1) segmentsOut.push(current.join(" "));
      current = [];
      return;
    }

    const barHeight = getStackedBarHeightPercent(visibleTotal, maxVisibleTotal);
    const x = ((index + 0.5) / count) * 100;
    const y = 100 - barHeight;

    current.push(`${Math.max(1.5, Math.min(98.5, x))},${Math.max(0, Math.min(98, y))}`);
  });

  if (current.length > 1) segmentsOut.push(current.join(" "));

  return segmentsOut;
}

function VerticalTimeSeriesChart({ title, description, rows, period, segments, lineLabel = "" }) {
  const maxVisibleTotal = Math.max(...rows.map((row) => getSegmentTotal(row, segments)), 1);
  const lineSegments = buildTopOfBarLineSegments(rows, segments, maxVisibleTotal);

  return (
    <div className="chart-card powerbi-timeseries-card">
      <div className="chart-header-row compact-chart-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {lineLabel ? <span className="soft-pill">{lineLabel}</span> : null}
      </div>

      <div className="powerbi-chart-area">
        <div className="powerbi-y-axis">
          <span>{maxVisibleTotal}</span>
          <span>{Math.round(maxVisibleTotal / 2)}</span>
          <span>0</span>
        </div>

        <div className="powerbi-plot">
          {rows.map((row) => {
            const visibleTotal = getSegmentTotal(row, segments);
            const barHeight = getStackedBarHeightPercent(visibleTotal, maxVisibleTotal);

            return (
              <div className="powerbi-column" key={row.period_start}>
                <div className="powerbi-bar-slot">
                  <div className="powerbi-stacked-bar" style={{ height: `${barHeight}%` }}>
                    {segments.map((segment) => {
                      const value = Number(row[segment.key]) || 0;
                      const height = visibleTotal ? (value / visibleTotal) * 100 : 0;

                      return (
                        <div
                          key={segment.key}
                          className={`powerbi-segment ${segment.className}`}
                          style={{ height: `${height}%` }}
                          title={`${segment.label}: ${value}`}
                        />
                      );
                    })}
                    {visibleTotal > 0 ? <div className="powerbi-bar-topline" /> : null}
                  </div>
                </div>
                <div className="powerbi-x-label">{formatSeriesDate(row.period_start, period)}</div>
              </div>
            );
          })}

          {lineSegments.length > 0 ? (
            <svg className="powerbi-line-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              {lineSegments.map((points, index) => (
                <polyline key={index} className="powerbi-connected-topline" points={points} />
              ))}
            </svg>
          ) : null}

          {rows.length === 0 && <div className="empty-cell">No time series data found.</div>}
        </div>
      </div>

      <div className="powerbi-legend">
        {segments.map((segment) => (
          <span key={segment.key}><i className={`legend-box ${segment.className}`} /> {segment.label}</span>
        ))}
        {lineLabel ? <span><i className="line-legend" /> {lineLabel}</span> : null}
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
      subtitle=""
      summaryControls={controls}
      summaryStats={[]}
    >
      <section className="center-panel workforce-full-span no-panel-bg overview-page-fit">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="kpi-grid compact-kpi-grid overview-kpi-grid overview-kpi-grid-five">
          <div className="metric-card kpi-card kpi-total">
            <div className="metric-label">Total Workforce</div>
            <div className="metric-value">{totalPeople}</div>
            <div className="mini-info-text">Anyone with an entry scan in the workforce window.</div>
          </div>

          <div className="metric-card kpi-card status-amber">
            <div className="metric-label">Greater Than 8 Hours</div>
            <div className="metric-value">{over8}</div>
            <div className="mini-info-text">{over8Pct}% of total workforce.</div>
          </div>

          <div className="metric-card kpi-card status-orange">
            <div className="metric-label">Greater Than 10 Hours</div>
            <div className="metric-value">{over10}</div>
            <div className="mini-info-text">{over10Pct}% of total workforce.</div>
          </div>

          <div className="metric-card kpi-card status-red">
            <div className="metric-label">Greater Than 12 Hours</div>
            <div className="metric-value">{over12}</div>
            <div className="mini-info-text">{over12Pct}% high-hour exposure.</div>
          </div>

          <div className="metric-card kpi-card latest-scan-kpi">
            <div className="metric-label">Latest Scan</div>
            <div className="metric-value small-value">{formatDateTime(summary?.latestScan)}</div>
            <div className="mini-info-text">Most recent Hikvision scan.</div>
          </div>
        </div>

        <div className="overview-timeseries-stack">
          <VerticalTimeSeriesChart
            title="Working Hours Compliance"
            description="Stacked population by work-hour bucket."
            rows={series}
            period={trendPeriod}
            segments={[
              { key: "hours_8_or_less", label: "< 8 hours", className: "stack-blue" },
              { key: "hours_8_10", label: "8-10 hours", className: "stack-yellow" },
              { key: "hours_10_12", label: "10-12 hours", className: "stack-orange" },
              { key: "hours_12_plus", label: "> 12 hours", className: "stack-red" },
            ]}
          />

          <VerticalTimeSeriesChart
            title="Working Days Compliance"
            description="More than 4 hours counts as one day. Stacked by number of counted days."
            rows={series}
            period={trendPeriod}
            segments={[
              { key: "days_5_or_less", label: "Less than 5 days", className: "stack-yellow" },
              { key: "days_6", label: "5-6 days", className: "stack-orange" },
              { key: "days_over_6", label: "Greater than 6 days", className: "stack-red" },
            ]}
          />
        </div>
      </section>
    </AppShell>
  );
}
