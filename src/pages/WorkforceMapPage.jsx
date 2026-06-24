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

/*
  SVG MANUAL EDIT GUIDE

  The map uses this coordinate system:
  - viewBox = "0 0 100 75"
  - x goes left to right: 0 to 100
  - y goes top to bottom: 0 to 75

  To move a shape:
  - Increase every x number = move right
  - Decrease every x number = move left
  - Increase every y number = move down
  - Decrease every y number = move up

  To make a shape with more corners:
  - Add more "x,y" points in the points string.

  Example rectangle:
  points: "10,10 30,10 30,20 10,20"

  Example L-shape:
  points: "10,10 30,10 30,17 24,17 24,20 10,20"

  labelX / labelY controls where the text number appears.
*/

const MAP_ZONES = [
  {
    id: "admin",
    areaKey: "admin",
    label: "Admin",
    className: "area-admin",
    points: "38,5.5 49,5.5 49,5.9 53,5.9 53,12.5 49.4,12.5 49.4,19.9 42.2,19.9 42.2,16.5 38 16.5",
    labelX: 44.5,
    labelY: 10.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "production-main",
    areaKey: "production",
    label: "Production",
    className: "area-production",
    points: "53.3,12 84,12 84,31.5 75.6,31.5 75.6, 32.6 53.2,32.6 53.2,30.7 49.7,30.7 49.7,12.8 53.3,12.8",
    labelX: 69,
    labelY: 21.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "production-secondary",
    areaKey: "production",
    label: "",
    className: "area-production",
    points: "47.3,36 80.4,36 80.4, 53.2 47.3,53.2",
    labelX: 64,
    labelY: 44.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "logisticsqa",
    areaKey: "logisticsqa",
    label: "Logistics / QA",
    className: "area-logisticsqa",
    points: "76,42.5 87,42.5 87,49.5 76,49.5",
    labelX: 81.5,
    labelY: 46,
    showLabel: true,
    showValue: true,
  },
  {
    id: "rd-main",
    areaKey: "rd",
    label: "R&D",
    className: "area-rd",
    points: "22,31 30,31 30,47 22,47",
    labelX: 26,
    labelY: 39,
    showLabel: true,
    showValue: true,
  },
  {
    id: "engineering",
    areaKey: "engineering",
    label: "Engineering",
    className: "area-engineering",
    points: "16,58 32,58 32,70.5 16,70.5",
    labelX: 24,
    labelY: 64,
    showLabel: true,
    showValue: true,
  },
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

function getAreaData(areaLookup, areaKey) {
  const meta = AREA_META.find((item) => item.key === areaKey);
  return areaLookup.get(meta?.dataKey || areaKey) || {};
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
    <AppShell title="Workforce Map Overview" subtitle="" summaryControls={controls} summaryStats={[]}>
      <section className="panel center-panel workforce-full-span workforce-map-page workforce-map-svg-page">
        {error && <div className="error-box page-error">{error}</div>}

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
              <svg className="map-zone-svg" viewBox="0 0 100 75" preserveAspectRatio="none">
                {MAP_ZONES.map((zone) => {
                  const data = getAreaData(areaLookup, zone.areaKey);
                  const activeCount = Number(data.activeCount) || 0;
                  return (
                    <g className={`map-zone-group ${zone.className}`} key={zone.id}>
                      <polygon className="map-zone-polygon" points={zone.points}>
                        <title>{`${zone.label || zone.areaKey}: ${activeCount} people`}</title>
                      </polygon>
                    </g>
                  );
                })}
              </svg>

              <div className="map-zone-label-layer" aria-hidden="true">
                {MAP_ZONES.filter((zone) => zone.showLabel || zone.showValue).map((zone) => {
                  const data = getAreaData(areaLookup, zone.areaKey);
                  const activeCount = Number(data.activeCount) || 0;
                  return (
                    <div
                      className={`map-zone-text ${zone.className}`}
                      key={`${zone.id}-label`}
                      style={{
                        left: `${zone.labelX}%`,
                        top: `${(zone.labelY / 75) * 100}%`,
                      }}
                    >
                      {zone.showLabel ? <span>{zone.label}</span> : null}
                      {zone.showValue ? <strong>{activeCount}</strong> : null}
                    </div>
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
