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

      <button className="summary-refresh-btn" onClick={fetchPopulation} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>
    </>
  );

  return (
    <AppShell
      title="Workforce Population"
      subtitle="Population breakdown by subgroup for selected workforce day"
      summaryControls={controls}
      summaryStats={[
        { value: total, label: "TOTAL" },
        { value: rows.length, label: "SUBGROUPS" },
        { value: workforceDate, label: "DATE", variant: "green" },
      ]}
    >
      <section className="panel center-panel workforce-full-span">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="chart-card population-card">
          <h3>Population by Subgroup</h3>
          <div className="bar-list population-bars">
            {rows.map((row) => {
              const value = Number(row.population) || 0;
              return (
                <div className="bar-row" key={row.persongroup}>
                  <div className="bar-name">{row.persongroup || "Unknown"}</div>
                  <div className="bar-track">
                    <div className="bar-fill fill-green" style={{ width: `${(value / max) * 100}%` }} />
                  </div>
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
