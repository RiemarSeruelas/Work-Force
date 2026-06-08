import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getTitle(group) {
  if (group === "FTE") return "FTE Workforce Compliance";
  if (group === "CONTRACTOR") return "Contractor Workforce Compliance";
  return "Workforce Compliance";
}

const CATEGORY_LABELS = {
  greater_than_60_hours: "Greater than 60 Hours",
  hours_51_60: "51-60 Hours",
  hours_41_50: "41-50 Hours",
  less_than_40_hours: "Less than 40 Hours",
  greater_than_6_days: "Greater than 6 Days",
  days_6: "6 Days",
  days_5_or_less: "5 Days and Below",
};

function BarList({ title, rows, field, colorClass, onSelect, selected }) {
  const sortedRows = [...rows].sort(
    (a, b) => (Number(b[field]) || 0) - (Number(a[field]) || 0)
  );
  const max = Math.max(...sortedRows.map((r) => Number(r[field]) || 0), 1);

  return (
    <div className="chart-card compact-chart-card">
      <div className="compact-card-title">{title}</div>
      <div className="bar-list compliance-bar-list">
        {sortedRows.map((row) => {
          const value = Number(row[field]) || 0;
          const isActive = selected?.field === field && selected?.persongroup === row.persongroup;

          return (
            <button
              type="button"
              className={`bar-row bar-row-button ${isActive ? "active" : ""}`}
              key={`${title}-${row.persongroup}`}
              onClick={() => onSelect?.({ field, persongroup: row.persongroup, title })}
              title="Click to show names in this category"
            >
              <span className="bar-name full-bar-name">{row.persongroup || "Unknown"}</span>
              <span className="bar-track">
                <span
                  className={`bar-fill ${colorClass}`}
                  style={{ width: `${Math.max((value / max) * 100, value ? 4 : 0)}%` }}
                />
              </span>
              <span className="bar-num">{value}</span>
            </button>
          );
        })}

        {sortedRows.length === 0 && <div className="empty-cell">No data.</div>}
      </div>
    </div>
  );
}

function PersonDrilldown({ selected, people }) {
  const category = selected?.field || "greater_than_60_hours";
  const persongroup = selected?.persongroup || "";

  const filteredPeople = useMemo(() => {
    return people
      .filter((person) => {
        const sameGroup = !persongroup || person.persongroup === persongroup;
        const sameCategory =
          person.hours_category === category || person.days_category === category;
        return sameGroup && sameCategory;
      })
      .sort((a, b) => {
        const hoursDiff = (Number(b.total_hours) || 0) - (Number(a.total_hours) || 0);
        if (hoursDiff !== 0) return hoursDiff;
        return String(a.person || "").localeCompare(String(b.person || ""));
      });
  }, [people, persongroup, category]);

  return (
    <div className="chart-card compliance-drilldown-card">
      <div className="chart-header-row compact-chart-header">
        <div>
          <h3>Names in Category</h3>
          <p>
            {selected
              ? `${persongroup || "All groups"} · ${CATEGORY_LABELS[category] || category}`
              : "Click any bar to show the people behind it."}
          </p>
        </div>
      </div>

      <div className="drilldown-list">
        {filteredPeople.map((person, index) => (
          <div className="drilldown-row" key={`${person.person}-${index}`}>
            <div className="drilldown-name">{person.person || "Unknown"}</div>
            <div className="drilldown-meta">{Number(person.total_hours || 0).toFixed(2)} hrs</div>
            <div className="drilldown-meta">{person.working_days} days</div>
          </div>
        ))}

        {filteredPeople.length === 0 && (
          <div className="empty-cell">No names for this category yet.</div>
        )}
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
  const [selectedBucket, setSelectedBucket] = useState(null);

  useEffect(() => {
    fetchCompliance?.(group);
    setSelectedBucket(null);
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
      <section className="panel center-panel workforce-full-span compliance-page-panel">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="compliance-shell-grid">
          <div className="compliance-left-grid">
            <BarList title="Greater than 60 Hours" rows={rows} field="greater_than_60_hours" colorClass="fill-red" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="51-60 Hours" rows={rows} field="hours_51_60" colorClass="fill-blue" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="41-50 Hours" rows={rows} field="hours_41_50" colorClass="fill-navy" selected={selectedBucket} onSelect={setSelectedBucket} />
          </div>

          <div className="compliance-middle-gap" aria-hidden="true" />

          <div className="compliance-right-grid">
            <BarList title="Greater than 6 Days" rows={rows} field="greater_than_6_days" colorClass="fill-red" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="6 Days" rows={rows} field="days_6" colorClass="fill-blue" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="5 Days and Below" rows={rows} field="days_5_or_less" colorClass="fill-green" selected={selectedBucket} onSelect={setSelectedBucket} />
          </div>

          <PersonDrilldown selected={selectedBucket} people={people} />
        </div>
      </section>
    </AppShell>
  );
}
