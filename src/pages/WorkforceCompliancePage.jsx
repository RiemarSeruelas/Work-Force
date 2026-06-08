import { useEffect, useMemo } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getTitle(group) {
  if (group === "FTE") return "Cavite Foods Workforce Compliance for FTE";
  if (group === "CONTRACTOR") return "Cavite Foods Workforce Compliance for Contractors";
  return "Cavite Foods Workforce Compliance";
}

function BarList({ title, rows, field, colorClass }) {
  const max = Math.max(...rows.map((r) => Number(r[field]) || 0), 1);

  return (
    <div className="chart-card compact-chart-card">
      <h3>{title}</h3>
      <div className="bar-list">
        {rows.length === 0 && <div className="empty-cell">No compliance data found.</div>}
        {rows.slice(0, 8).map((row) => {
          const value = Number(row[field]) || 0;
          return (
            <div className="bar-row" key={`${title}-${row.persongroup}`}>
              <div className="bar-name">{row.persongroup || "Unknown"}</div>
              <div className="bar-track">
                <div className={`bar-fill ${colorClass}`} style={{ width: `${(value / max) * 100}%` }} />
              </div>
              <div className="bar-num">{value}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function WorkforceCompliancePage({ group = "ALL" }) {
  const selectedYear = useWorkforceStore((s) => s.selectedYear);
  const selectedWeek = useWorkforceStore((s) => s.selectedWeek);
  const setSelectedYear = useWorkforceStore((s) => s.setSelectedYear);
  const setSelectedWeek = useWorkforceStore((s) => s.setSelectedWeek);
  const compliance = useWorkforceStore((s) => s.compliance);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchCompliance = useWorkforceStore((s) => s.fetchCompliance);

  useEffect(() => {
    fetchCompliance?.(group);
  }, [fetchCompliance, selectedYear, selectedWeek, group]);

  const rows = useMemo(() => compliance?.rows || [], [compliance]);
  const totals = compliance?.totals || {};

  const controls = (
    <>
      <label className="summary-filter-field summary-filter-small">
        <span>Year</span>
        <input
          className="summary-input"
          type="number"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        />
      </label>

      <label className="summary-filter-field summary-filter-small">
        <span>Week</span>
        <input
          className="summary-input"
          type="number"
          min="1"
          max="53"
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
        />
      </label>

      <button className="summary-refresh-btn" onClick={() => fetchCompliance(group)} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </>
  );

  return (
    <AppShell
      title={getTitle(group)}
      subtitle={compliance ? `Week ${compliance.week}: ${compliance.startDate} to ${compliance.endDate}` : "Weekly workforce compliance"}
      summaryControls={controls}
      summaryStats={[
        { value: totals.population ?? 0, label: "POPULATION" },
        { value: totals.greaterThan60Hours ?? 0, label: "> 60 HOURS", variant: "red" },
        { value: totals.nonCompliantWorkingDays ?? 0, label: "> 6 DAYS", variant: "amber" },
        { value: group, label: "GROUP", variant: "green" },
      ]}
    >
      <section className="panel center-panel workforce-full-span">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="compliance-grid">
          <BarList title="Greater than 60 Hours" rows={rows} field="greater_than_60_hours" colorClass="fill-red" />
          <BarList title="51-60 Hours" rows={rows} field="hours_51_60" colorClass="fill-blue" />
          <BarList title="41-50 Hours" rows={rows} field="hours_41_50" colorClass="fill-navy" />
          <BarList title="Less than 40 Hours" rows={rows} field="less_than_40_hours" colorClass="fill-green" />
          <BarList title="Greater than 6 Days" rows={rows} field="greater_than_6_days" colorClass="fill-red" />
          <BarList title="6 Days" rows={rows} field="days_6" colorClass="fill-blue" />
          <BarList title="5 Days" rows={rows} field="days_5" colorClass="fill-navy" />
        </div>
      </section>
    </AppShell>
  );
}
