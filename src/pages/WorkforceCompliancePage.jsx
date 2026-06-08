import { useEffect, useMemo } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getTitle(group) {
  if (group === "FTE") return "FTE Workforce Compliance";
  if (group === "CONTRACTOR") return "Contractor Workforce Compliance";
  return "Workforce Compliance";
}

function BarList({ title, rows, field, colorClass }) {
  const sortedRows = [...rows].sort(
    (a, b) => (Number(b[field]) || 0) - (Number(a[field]) || 0)
  );
  const max = Math.max(...sortedRows.map((r) => Number(r[field]) || 0), 1);

  return (
    <div className="chart-card compact-chart-card">
      <h3>{title}</h3>
      <div className="bar-list">
        {sortedRows.length === 0 && <div className="empty-cell">No compliance data found.</div>}
        {sortedRows.slice(0, 8).map((row) => {
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
  const people = useMemo(() => compliance?.people || [], [compliance]);
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
      subtitle={
        compliance
          ? `Week ${compliance.week}: ${compliance.startDate} to ${compliance.endDate}. More than 4 hours counts as 1 day.`
          : "Weekly workforce compliance. Hours reset every Monday."
      }
      summaryControls={controls}
      summaryStats={[
        { value: totals.population ?? 0, label: "POPULATION" },
        { value: totals.greaterThan60Hours ?? 0, label: "> 60 HOURS", variant: "red" },
        { value: totals.nonCompliantWorkingDays ?? 0, label: "> 6 DAYS", variant: "amber" },
        { value: totals.days5OrLess ?? 0, label: "≤ 5 DAYS", variant: "green" },
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
          <BarList title="5 Days and Below" rows={rows} field="days_5_or_less" colorClass="fill-green" />
        </div>

        <div className="chart-card people-ranking-card">
          <div className="chart-header-row">
            <div>
              <h3>Highest Weekly Hours</h3>
              <p>Sorted from highest to lowest. Day count only includes days with more than 4 hours.</p>
            </div>
          </div>

          <div className="people-ranking-list">
            {people.map((person, index) => (
              <div className="people-ranking-row" key={`${person.person}-${index}`}>
                <div className="people-rank">{index + 1}</div>
                <div className="people-main">
                  <b>{person.person || "Unknown"}</b>
                  <span>{person.persongroup || "Unknown"}</span>
                </div>
                <div className="people-days">{person.working_days} days</div>
                <div className="people-hours">{Number(person.total_hours || 0).toFixed(2)} hrs</div>
              </div>
            ))}

            {people.length === 0 && <div className="empty-cell">No weekly person data found.</div>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
