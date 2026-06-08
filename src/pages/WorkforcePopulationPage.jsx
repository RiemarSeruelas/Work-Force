import { useEffect } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

export default function WorkforcePopulationPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const rows = useWorkforceStore((s) => s.populationRows);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchPopulation = useWorkforceStore((s) => s.fetchPopulation);

  useEffect(() => {
    fetchPopulation?.();
  }, [fetchPopulation, workforceDate]);

  const total = rows.reduce((sum, row) => sum + (Number(row.population) || 0), 0);
  const max = Math.max(...rows.map((r) => Number(r.population) || 0), 1);

  return (
    <AppShell
      title="Workforce Population"
      subtitle="Population breakdown by subgroup for selected workforce day"
      summaryStats={[
        { value: total, label: "TOTAL" },
        { value: rows.length, label: "SUBGROUPS" },
        { value: workforceDate, label: "DATE", variant: "green" },
      ]}
    >
      <aside className="panel left-panel">
        <div className="panel-title">Filters</div>
        <label className="field-label">Workforce Date</label>
        <input className="styled-input" type="date" value={workforceDate} onChange={(e) => setWorkforceDate(e.target.value)} />
        <button className="primary-action-btn" onClick={fetchPopulation} disabled={loading}>{loading ? "Loading..." : "Refresh"}</button>
        {error && <div className="error-box">{error}</div>}
      </aside>

      <section className="panel center-panel workforce-center-span">
        <div className="chart-card population-card">
          <h3>Population by Subgroup</h3>
          <div className="bar-list population-bars">
            {rows.map((row) => {
              const value = Number(row.population) || 0;
              return (
                <div className="bar-row" key={row.persongroup}>
                  <div className="bar-name">{row.persongroup || "Unknown"}</div>
                  <div className="bar-track"><div className="bar-fill fill-green" style={{ width: `${(value / max) * 100}%` }} /></div>
                  <div className="bar-num">{value}</div>
                </div>
              );
            })}
            {rows.length === 0 && <div className="empty-cell">No population data found.</div>}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
