import { useEffect, useMemo } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

const AREA_META = [
  { key: "engineering", label: "Engineering", icon: "⚙", className: "area-engineering" },
  { key: "production", label: "Production", icon: "🏭", className: "area-production" },
  { key: "warehouse", label: "Warehouse", icon: "▣", className: "area-warehouse" },
  { key: "utilities", label: "Utilities", icon: "⚡", className: "area-utilities" },
  { key: "admin", label: "Admin", icon: "👤", className: "area-admin" },
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

function formatTime(value) {
  if (!value) return "No OUT";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString("en-PH", {
    timeZone: "Asia/Manila",
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
  const mapPeople = useWorkforceStore((s) => s.mapPeople);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchMap = useWorkforceStore((s) => s.fetchMap);

  useEffect(() => {
    fetchMap?.();
  }, [fetchMap, workforceDate, group]);

  const areaLookup = useMemo(() => {
    return new Map((mapAreas || []).map((area) => [area.key, area]));
  }, [mapAreas]);

  const activePeople = useMemo(() => {
    return (mapPeople || []).filter((person) => person.isActiveInside).slice(0, 18);
  }, [mapPeople]);

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
      summaryStats={[
        { value: mapSummary?.activeInside ?? 0, label: "INSIDE NOW" },
        { value: mapSummary?.totalToday ?? 0, label: "TOTAL TODAY", variant: "green" },
        { value: mapSummary?.occupiedAreas ?? 0, label: "ACTIVE AREAS", variant: "amber" },
        { value: mapSummary?.alarmCount ?? 0, label: "24H ALARMS", variant: "red" },
      ]}
    >
      <section className="panel center-panel workforce-full-span workforce-map-page">
        {error && <div className="error-box page-error">{error}</div>}

        <div className="map-layout-grid">
          <aside className="map-side-card">
            <div className="map-side-title">Legend</div>
            <div className="map-legend-list">
              {AREA_META.map((area) => {
                const data = areaLookup.get(area.key) || {};
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

            <div className="map-people-card">
              <div className="map-side-title small">Inside now</div>
              <div className="map-people-list">
                {activePeople.map((person, index) => (
                  <div className="map-person-row" key={`${person.person}-${index}`}>
                    <div>
                      <strong>{person.person || "Unknown"}</strong>
                      <span>{person.areaLabel} · {formatTime(person.scanIn)} - {formatTime(person.scanOut)}</span>
                    </div>
                    {person.has24HourAlarm ? <em>⚠</em> : null}
                  </div>
                ))}
                {activePeople.length === 0 && <div className="empty-cell compact-empty">No active inside records.</div>}
              </div>
            </div>
          </aside>

          <div className="map-stage-card">
            <div className="map-blueprint-canvas" aria-label="Workforce map">
              <div className="map-road road-left">Linares Extension</div>
              <div className="map-road road-right">Linares Street</div>
              <div className="map-faint-building building-top" />
              <div className="map-faint-building building-mid" />
              <div className="map-faint-building building-bottom" />
              <div className="map-dock-row dock-right-one" />
              <div className="map-dock-row dock-right-two" />
              <div className="map-tree-row tree-bottom" />
              <div className="map-tree-row tree-right" />

              {AREA_META.map((area) => {
                const data = areaLookup.get(area.key) || {};
                const activeCount = Number(data.activeCount) || 0;
                const totalToday = Number(data.totalToday) || 0;
                const alarmCount = Number(data.alarmCount) || 0;

                return (
                  <button
                    type="button"
                    className={`map-zone ${area.className} zone-${area.key}`}
                    key={area.key}
                    title={`${area.label}: ${activeCount} inside now, ${totalToday} total today`}
                  >
                    <span className="map-zone-label">{area.label}</span>
                    <strong>{activeCount}</strong>
                    <small>{totalToday} today{alarmCount ? ` · ⚠ ${alarmCount}` : ""}</small>
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
