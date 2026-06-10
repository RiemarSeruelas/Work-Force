import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getTitle(group) {
  if (group === "FTE") return "Workforce Compliance · FTE";
  if (group === "CONTRACTOR") return "Workforce Compliance · Contractor";
  return "Workforce Compliance";
}

const CATEGORY_LABELS = {
  greater_than_60_hours: "60+ Hours",
  hours_40_60: "40-60 Hours",
  less_than_40_hours: "< 40 Hours",
  day_1: "1 Day",
  day_2: "2 Days",
  day_3: "3 Days",
  day_4: "4 Days",
  day_5: "5 Days",
  day_6: "6 Days",
  day_7: "7 Days",
};

function addDays(dateString, offset) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function formatDayLabel(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T12:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buildWeekDays(startDate, personDays = []) {
  const lookup = new Map(
    (Array.isArray(personDays) ? personDays : []).map((day) => [String(day.date), day])
  );

  if (startDate) {
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(startDate, index);
      return lookup.get(date) || { date, hours: 0, firstScan: null, lastScan: null, countedDay: false };
    });
  }

  return [...lookup.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function formatHours(value) {
  const hours = Number(value) || 0;
  if (!hours) return "No scan";
  return `${hours.toFixed(2)} hrs`;
}

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
              title="Show names in this category"
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

function PersonWeekTooltip({ hover }) {
  if (!hover?.person) return null;

  const person = hover.person;
  const weekDays = hover.weekDays || [];

  return (
    <div
      className="person-week-tooltip fixed-person-week-tooltip"
      role="tooltip"
      style={{ top: `${hover.top}px`, left: `${hover.left}px` }}
    >
      <div className="person-week-tooltip-title">{person.person || "Unknown"}</div>
      <div className="person-week-tooltip-subtitle">
        Weekly view · {Number(person.total_hours || 0).toFixed(2)} total hrs · {person.working_days} counted days
      </div>

      <div className="person-week-days">
        {weekDays.map((day) => {
          const hours = Number(day.hours) || 0;
          const hasScan = hours > 0;
          const timeRange = day.firstScan && day.lastScan ? `${day.firstScan} - ${day.lastScan}` : "No scan";

          return (
            <div className={`person-week-day ${hasScan ? "has-scan" : "no-scan"}`} key={day.date}>
              <span>{formatDayLabel(day.date)}</span>
              <b>{formatHours(hours)}</b>
              <small>{timeRange}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PersonDrilldown({ selected, people, startDate }) {
  const category = selected?.field || "greater_than_60_hours";
  const persongroup = selected?.persongroup || "";
  const [hover, setHover] = useState(null);

  function showWeeklyHover(event, person) {
    const rect = event.currentTarget.getBoundingClientRect();
    const popupWidth = 360;
    const popupHeight = 330;
    const left = Math.max(14, Math.min(window.innerWidth - popupWidth - 14, rect.left - popupWidth - 12));
    const top = Math.max(14, Math.min(window.innerHeight - popupHeight - 14, rect.top - 8));

    setHover({
      person,
      weekDays: buildWeekDays(startDate, person.week_days),
      left,
      top,
    });
  }

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
          {selected && (
            <p>{`${persongroup || "All groups"} · ${CATEGORY_LABELS[category] || category}`}</p>
          )}
        </div>
      </div>

      <div className="drilldown-list">
        {filteredPeople.map((person, index) => (
          <div
            className="drilldown-row person-hover-row"
            key={`${person.person}-${index}`}
            tabIndex={0}
            onMouseEnter={(event) => showWeeklyHover(event, person)}
            onMouseLeave={() => setHover(null)}
            onFocus={(event) => showWeeklyHover(event, person)}
            onBlur={() => setHover(null)}
          >
            <div className="drilldown-name">{person.person || "Unknown"}</div>
            <div className="drilldown-meta">{Number(person.total_hours || 0).toFixed(2)} hrs</div>
            <div className="drilldown-meta">{person.working_days} days</div>
          </div>
        ))}

        {filteredPeople.length === 0 && (
          <div className="empty-cell">No names for this category yet.</div>
        )}
      </div>

      <PersonWeekTooltip hover={hover} />
    </div>
  );
}

export default function WorkforceCompliancePage() {
  const selectedYear = useWorkforceStore((s) => s.selectedYear);
  const selectedWeek = useWorkforceStore((s) => s.selectedWeek);
  const setSelectedYear = useWorkforceStore((s) => s.setSelectedYear);
  const setSelectedWeek = useWorkforceStore((s) => s.setSelectedWeek);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
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

      <label className="summary-filter-field summary-filter-medium">
        <span>Group</span>
        <select
          className="summary-input"
          value={group}
          onChange={(e) => setGroup(e.target.value)}
        >
          <option value="ALL">All</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>
      </label>

      <button className="summary-refresh-btn" onClick={() => fetchCompliance(group)} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </>
  );

  return (
    <AppShell
      title={getTitle(group)}
      subtitle=""
      summaryControls={controls}
      summaryStats={[
        { value: totals.population ?? 0, label: "POPULATION" },
        { value: totals.greaterThan60Hours ?? 0, label: "60+ HOURS", variant: "red" },
        { value: totals.lessThan40Hours ?? 0, label: "< 40 HOURS", variant: "amber" },
        { value: totals.hours40To60 ?? 0, label: "40-60 HOURS", variant: "amber" },
        { value: totals.nonCompliantWorkingDays ?? 0, label: "6+ DAYS", variant: "red" },
      ]}
    >
      <section className="panel center-panel workforce-full-span compliance-page-panel">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="compliance-shell-grid">
          <div className="compliance-left-grid">
            <BarList title="60+ Hours" rows={rows} field="greater_than_60_hours" colorClass="fill-red" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="40-60 Hours" rows={rows} field="hours_40_60" colorClass="fill-orange" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="< 40 Hours" rows={rows} field="less_than_40_hours" colorClass="fill-amber" selected={selectedBucket} onSelect={setSelectedBucket} />
          </div>

          <div className="compliance-middle-gap" aria-hidden="true" />

          <div className="compliance-right-grid compliance-days-grid">
            <BarList title="1 Day" rows={rows} field="day_1" colorClass="fill-red" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="2 Days" rows={rows} field="day_2" colorClass="fill-orange" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="3 Days" rows={rows} field="day_3" colorClass="fill-yellow" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="4 Days" rows={rows} field="day_4" colorClass="fill-green" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="5 Days" rows={rows} field="day_5" colorClass="fill-blue" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="6 Days" rows={rows} field="day_6" colorClass="fill-indigo" selected={selectedBucket} onSelect={setSelectedBucket} />
            <BarList title="7 Days" rows={rows} field="day_7" colorClass="fill-violet" selected={selectedBucket} onSelect={setSelectedBucket} />
          </div>

          <PersonDrilldown selected={selectedBucket} people={people} startDate={compliance?.startDate} />
        </div>
      </section>
    </AppShell>
  );
}
