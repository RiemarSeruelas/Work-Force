import { useEffect, useMemo } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

const AREA_META = [
  { key: "engineering", dataKey: "utilities", label: "Engineering", icon: "⚙", className: "area-engineering" },
  { key: "production", dataKey: "production", label: "Production", icon: "🏭", className: "area-production" },
  { key: "logisticsqa", dataKey: "warehouse", label: "Logistics / QA", icon: "🧪", className: "area-logisticsqa" },
  { key: "rd", dataKey: "engineering", label: "R&D", icon: "🔬", className: "area-rd" },
  { key: "admin", dataKey: "admin", label: "Admin", icon: "👤", className: "area-admin" },
];

const MAP_ZONES = [
  { id: "engineering", areaKey: "engineering", label: "Engineering", className: "area-engineering zone-engineering", showLabel: true, showValue: true },
  { id: "production-main", areaKey: "production", label: "Production", className: "area-production zone-production-main", showLabel: true, showValue: true },
  { id: "production-secondary", areaKey: "production", label: "", className: "area-production zone-production-secondary zone-muted-fill", showLabel: false, showValue: false },
  { id: "logisticsqa", areaKey: "logisticsqa", label: "Logistics / QA", className: "area-logisticsqa zone-logisticsqa", showLabel: true, showValue: true },
  { id: "rd-main", areaKey: "rd", label: "R&D", className: "area-rd zone-rd-main", showLabel: true, showValue: true },
  { id: "rd-lab", areaKey: "rd", label: "", className: "area-rd zone-rd-lab zone-muted-fill", showLabel: false, showValue: false },
  { id: "admin", areaKey: "admin", label: "Admin", className: "area-admin zone-admin", showLabel: true, showValue: true },
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
      <section className="panel center-panel workforce-full-span workforce-map-page workforce-map-mockup-page">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="map-section-header">
          <h2>Workforce Map Overview</h2>
          <span className="map-section-accent" />
        </div>

        <div className="map-mockup-shell">
          <aside className="map-floating-legend">
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

          <div className="map-clean-stage">
            <div className="map-clean-frame" aria-label="Workforce map">
              {MAP_ZONES.map((zone) => {
                const meta = AREA_META.find((item) => item.key === zone.areaKey);
                const data = areaLookup.get(meta?.dataKey || zone.areaKey) || {};
                const activeCount = Number(data.activeCount) || 0;
                return (
                  <button
                    type="button"
                    className={`map-zone-card ${zone.className}`}
                    key={zone.id}
                    title={`${meta?.label || zone.label}: ${activeCount} people`}
                  >
                    {zone.showLabel ? <span className="map-zone-card-label">{zone.label}</span> : null}
                    {zone.showValue ? <strong>{activeCount}</strong> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
