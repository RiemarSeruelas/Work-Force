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
  return Math.max((Math.min(safeValue, safeMax) / safeMax) * 100, 4);
}

function formatCount(value) {
  return (Number(value) || 0).toLocaleString("en-US");
}

function formatPercent(value, total) {
  const safeValue = Number(value) || 0;
  const safeTotal = Number(total) || 0;
  if (!safeTotal) return "0%";
  return `${Math.round((safeValue / safeTotal) * 100)}%`;
}

function getTooltipSide(index, total) {
  if (index <= 1) return "tooltip-left";
  if (index >= total - 2) return "tooltip-right";
  return "";
}

function BarTooltip({ row, period, segments, total }) {
  const averageHours = row?.average_hours ?? row?.averageHours;
  const rawAverageDays = row?.average_days ?? row?.averageDays;
  const averageDays = period === "DAILY" ? null : rawAverageDays;

  return (
    <div className="powerbi-tooltip" role="tooltip">
      <div className="tooltip-title">{formatSeriesDate(row.period_start, period)}</div>
      <div className="tooltip-total">
        <span>Total</span>
        <b>{formatCount(total)}</b>
      </div>

      <div className="tooltip-breakdown">
        {segments.map((segment) => {
          const value = Number(row?.[segment.key]) || 0;
          return (
            <div className="tooltip-row" key={`${row.period_start}-${segment.key}`}>
              <span><i className={`tooltip-dot ${segment.className}`} /> {segment.label}</span>
              <b>{formatCount(value)} <small>{formatPercent(value, total)}</small></b>
            </div>
          );
        })}
      </div>

      {(averageHours !== undefined && averageHours !== null) ||
      (averageDays !== undefined && averageDays !== null) ? (
        <div className="tooltip-extra">
          {averageHours !== undefined && averageHours !== null ? (
            <span>Avg hours: <b>{Number(averageHours || 0).toFixed(2)}</b></span>
          ) : null}
          {averageDays !== undefined && averageDays !== null ? (
            <span>Avg days: <b>{Number(averageDays || 0).toFixed(2)}</b></span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function buildLineSegments(rows, segments, maxVisibleTotal) {
  if (!rows.length) return [];

  const count = Math.max(rows.length, 1);
  const segmentsOut = [];
  let current = [];

  rows.forEach((row, index) => {
    const visibleTotal = getSegmentTotal(row, segments);

    if (visibleTotal <= 0) {
      if (current.length > 1) {
        segmentsOut.push(current.map((point) => `${point.x},${point.y}`).join(" "));
      }
      current = [];
      return;
    }

    const barHeight = getStackedBarHeightPercent(visibleTotal, maxVisibleTotal);
    const x = ((index + 0.5) / count) * 100;
    const y = 100 - barHeight;

    current.push({
      x: Math.max(1.5, Math.min(98.5, Number(x.toFixed(3)))),
      y: Math.max(1, Math.min(98, Number(y.toFixed(3)))),
    });
  });

  if (current.length > 1) {
    segmentsOut.push(current.map((point) => `${point.x},${point.y}`).join(" "));
  }

  return segmentsOut;
}

function VerticalTimeSeriesChart({ title, description, rows, period, segments, lineLabel = "" }) {
  const maxVisibleTotal = Math.max(...rows.map((row) => getSegmentTotal(row, segments)), 1);
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
          {rows.map((row, index) => {
            const visibleTotal = getSegmentTotal(row, segments);
            const barHeight = getStackedBarHeightPercent(visibleTotal, maxVisibleTotal);
            const tooltipSide = getTooltipSide(index, rows.length);
            const nextRow = rows[index + 1];
            const nextVisibleTotal = nextRow ? getSegmentTotal(nextRow, segments) : 0;
            const nextBarHeight = getStackedBarHeightPercent(nextVisibleTotal, maxVisibleTotal);
            const currentTop = 100 - barHeight;
            const nextTop = 100 - nextBarHeight;
            const canConnectToNext = visibleTotal > 0 && nextVisibleTotal > 0;

            return (
              <div className="powerbi-column" key={row.period_start} tabIndex={visibleTotal > 0 ? 0 : -1}>
                <div className="powerbi-bar-slot">
                  {canConnectToNext ? (
                    <svg className="powerbi-local-connector" viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">
                      <line x1="50" y1={currentTop} x2="150" y2={nextTop} />
                    </svg>
                  ) : null}

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
                {visibleTotal > 0 ? (
                  <div className={`powerbi-tooltip-wrap ${tooltipSide}`}>
                    <BarTooltip row={row} period={period} segments={segments} total={visibleTotal} />
                  </div>
                ) : null}
                <div className="powerbi-x-label">{formatSeriesDate(row.period_start, period)}</div>
              </div>
            );
          })}

          {rows.length === 0 && <div className="empty-cell">No time series data found.</div>}
        </div>
      </div>

      <div className="powerbi-legend">
        {segments.map((segment) => (
          <span key={segment.key}>
            <i className={`legend-box ${segment.className}`} /> {segment.label}
          </span>
        ))}
        {lineLabel ? (
          <span>
            <i className="line-legend" /> {lineLabel}
          </span>
        ) : null}
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
    <AppShell title="Workforce Monitoring Overview" subtitle="" summaryControls={controls} summaryStats={[]}>
      <section className="center-panel workforce-full-span no-panel-bg overview-page-fit">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="kpi-grid compact-kpi-grid overview-kpi-grid overview-kpi-grid-five">
          <div className="metric-card kpi-card kpi-total no-mini">
            <div className="metric-label">Total Workforce</div>
            <div className="metric-value">{totalPeople}</div>
          </div>

          <div className="metric-card kpi-card status-amber">
            <div className="metric-label">&gt; 8 Hours</div>
            <div className="metric-value">{over8}</div>
            <div className="mini-info-text">8-10 hour bucket · {over8Pct}% of total workforce.</div>
          </div>

          <div className="metric-card kpi-card status-orange">
            <div className="metric-label">&gt; 10 Hours</div>
            <div className="metric-value">{over10}</div>
            <div className="mini-info-text">10-12 hour bucket · {over10Pct}% of total workforce.</div>
          </div>

          <div className="metric-card kpi-card status-red">
            <div className="metric-label">&gt; 12 Hours</div>
            <div className="metric-value">{over12}</div>
            <div className="mini-info-text">12+ hour bucket · {over12Pct}% high-hour exposure.</div>
          </div>

          <div className="metric-card kpi-card latest-scan-kpi no-mini">
            <div className="metric-label">Latest Scan</div>
            <div className="metric-value small-value">{formatDateTime(summary?.latestScan)}</div>
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
              { key: "days_1", label: "1 Day", className: "stack-violet" },
              { key: "days_2", label: "2 Days", className: "stack-indigo" },
              { key: "days_3", label: "3 Days", className: "stack-blue" },
              { key: "days_4", label: "4 Days", className: "stack-green" },
              { key: "days_5", label: "5 Days", className: "stack-yellow" },
              { key: "days_6", label: "6 Days", className: "stack-orange" },
              { key: "days_7", label: "7 Days", className: "stack-red" },
            ]}
          />
        </div>
      </section>
    </AppShell>
  );
}
