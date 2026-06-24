import { useEffect, useMemo } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

const AREA_META = [
  { key: "admin", dataKey: "admin", label: "Admin", icon: "👤", className: "area-admin" },
  { key: "production", dataKey: "production", label: "Production", icon: "🏭", className: "area-production" },
  { key: "engineering", dataKey: "utilities", label: "Engineering", icon: "⚙", className: "area-engineering" },
  { key: "logisticsqa", dataKey: "warehouse", label: "Logistics / QA", icon: "🧪", className: "area-logisticsqa" },
  { key: "rd", dataKey: "engineering", label: "R&D", icon: "🔬", className: "area-rd" },
];

function formatLatestScan(value) {
  if (!value) return "No scan yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function WorkforceMapPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
  const mapSummary = useWorkforceStore((s) => s.mapSummary);
  const mapAreas = useWorkforceStore((s) => s.mapAreas);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchMap = useWorkforceStore((s) => s.fetchMap);

  useEffect(() => {
    fetchMap?.();
  }, [fetchMap, workforceDate, group]);

  const areaLookup = useMemo(() => {
    return new Map((mapAreas || []).map((area) => [area.key, area]));
  }, [mapAreas]);

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

      <label className="summary-filter-field summary-filter-medium">
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

      <button className="summary-refresh-btn loading-aware-btn" onClick={fetchMap} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>
    </>
  );

  return (
    <AppShell
      title="Workforce Map Overview"
      subtitle=""
      summaryControls={controls}
      summaryStats={[]}
    >
      <section className="panel center-panel workforce-full-span workforce-map-page">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="map-layout-grid">
          <aside className="map-side-card">
            <div className="map-side-title">Legend</div>
            <div className="map-legend-list">
              {AREA_META.map((area) => {
                const data = areaLookup.get(area.dataKey) || {};
                return (
                  <div className="map-legend-row" key={area.key}>
                    <span className={`map-legend-icon ${area.className}`}>{area.icon}</span>
                    <span className="map-legend-name">{area.label}</span>
                    <b>{Number(data.activeCount) || 0}</b>
                  </div>
                );
              })}
            </div>

            <div className="map-latest-card">
              <span>Latest Scan</span>
              <b>{formatLatestScan(mapSummary?.latestScan)}</b>
            </div>
          </aside>

          <div className="map-stage-card">
            <div className="map-blueprint-canvas" aria-label="Workforce map">
              <div className="map-image-frame">
                {AREA_META.map((area) => {
                  const data = areaLookup.get(area.dataKey) || {};
                  const activeCount = Number(data.activeCount) || 0;
                  return (
                    <button
                      type="button"
                      className={`map-zone ${area.className} zone-${area.key}`}
                      key={area.key}
                      title={`${area.label}: ${activeCount} people`}
                    >
                      <span className="map-zone-label">{area.label}</span>
                      <strong>{activeCount}</strong>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
