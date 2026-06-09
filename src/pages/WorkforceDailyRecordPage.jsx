import { useEffect } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getHourStatus(hours) {
  const value = Number(hours) || 0;
  if (value >= 12) return { label: "12+ HRS", className: "bad" };
  if (value > 10) return { label: "> 10 HRS", className: "orange" };
  if (value > 8) return { label: "> 8 HRS", className: "warn" };
  return { label: "< 8 HRS", className: "ok" };
}

function fmt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function WorkforceDailyRecordPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
  const search = useWorkforceStore((s) => s.search);
  const setSearch = useWorkforceStore((s) => s.setSearch);
  const rows = useWorkforceStore((s) => s.dailyRows);
  const total = useWorkforceStore((s) => s.dailyTotal);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchDailyRecord = useWorkforceStore((s) => s.fetchDailyRecord);

  useEffect(() => {
    fetchDailyRecord?.();
  }, [fetchDailyRecord, workforceDate, group]);

  const under8 = rows.filter((r) => Number(r.work_hours) <= 8).length;
  const over8 = rows.filter((r) => Number(r.work_hours) > 8 && Number(r.work_hours) <= 10).length;
  const over10 = rows.filter((r) => Number(r.work_hours) > 10 && Number(r.work_hours) < 12).length;
  const over12 = rows.filter((r) => Number(r.work_hours) >= 12).length;

  return (
    <AppShell
      title="Details of Daily Working Hours"
      subtitle=""
      summaryStats={[
        { value: total, label: "TOTAL WORKFORCE" },
        { value: under8, label: "< 8 HOURS", variant: "green" },
        { value: over8, label: "> 8 HOURS", variant: "amber" },
        { value: over10, label: "> 10 HOURS", variant: "orange" },
        { value: over12, label: "12+ HRS", variant: "red" },
      ]}
    >
      <aside className="panel left-panel">
        <div className="panel-title">Filters</div>
        <label className="field-label">Workforce Date</label>
        <input className="styled-input" type="date" value={workforceDate} onChange={(e) => setWorkforceDate(e.target.value)} />
        <label className="field-label">Name / Department</label>
        <input className="styled-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search person..." />
        <label className="field-label">Group</label>
        <select className="styled-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="ALL">All Workforce</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>
        <button className="primary-action-btn" onClick={fetchDailyRecord} disabled={loading}>{loading ? "Loading..." : "Search"}</button>
        {error && <div className="error-box">{error}</div>}
      </aside>

      <section className="panel center-panel workforce-center-span">
        <div className="table-card">
          <div className="table-title">Daily Working Hours</div>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Subgroup</th>
                  <th>Person</th>
                  <th>Entry Time</th>
                  <th>Last Scan</th>
                  <th>Work Hours</th>
                  <th>Scan Count</th>
                  <th>Group</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.person_key}>
                    <td>{row.persongroup || "Unknown"}</td>
                    <td>{row.person}</td>
                    <td>{fmt(row.entry_time)}</td>
                    <td>{fmt(row.last_scan)}</td>
                    <td>{Number(row.work_hours || 0).toFixed(2)}</td>
                    <td>{row.scan_count}</td>
                    <td>{row.workforce_group || "FTE"}</td>
                    <td>
                      {(() => {
                        const status = getHourStatus(row.work_hours);
                        return <span className={`status-chip ${status.className}`}>{status.label}</span>;
                      })()}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan="8" className="empty-cell">No workforce records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
