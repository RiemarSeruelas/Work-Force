import { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

const AREA_META = [
  { key: "admin", dataKey: "admin", label: "Admin", icon: "👤", className: "area-admin" },
  { key: "savouryProduction", dataKey: "savouryProduction", label: "Savoury Production", icon: "🏭", className: "area-production" },
  { key: "dressingsProduction", dataKey: "dressingsProduction", label: "Dressings Production", icon: "🏭", className: "area-production" },
  { key: "engineering", dataKey: "engineering", label: "Engineering", icon: "⚙", className: "area-engineering" },
  { key: "logisticsqaSavoury", dataKey: "logisticsqaSavoury", label: "Logistics / QA Savoury", icon: "🧪", className: "area-logisticsqa" },
  { key: "logisticsqaDressings", dataKey: "logisticsqaDressings", label: "Logistics / QA Dressings", icon: "🧪", className: "area-logisticsqa" },
  { key: "rd", dataKey: "rd", label: "R&D", icon: "🔬", className: "area-rd" },
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

// Map zone labels are hidden on the map. The legend is the color key; the map only shows glowing numbers.
const MAP_ZONES = [
  {
    id: "admin",
    areaKey: "admin",
    label: "Admin",
    mapLabel: "Admin",
    className: "area-admin",
    points: "38,5.5 49,5.5 49,5.9 53,5.9 53,12.5 49.4,12.5 49.4,19.9 42.2,19.9 42.2,16.5 38 16.5",
    labelX: 44.6,
    labelY: 11.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "savoury-production",
    areaKey: "savouryProduction",
    label: "Savoury Production",
    mapLabel: "Savoury Prod",
    className: "area-production",
    points: "53.3,12 75.6,12 75.6,31.5 75.6,32.8 53.2,32.8 53.2,30.8 49.7,30.8 49.7,12.8 53.3,12.8",
    labelX: 63.5,
    labelY: 22,
    showLabel: true,
    showValue: true,
  },
  {
    id: "dressings-production",
    areaKey: "dressingsProduction",
    label: "Dressings Production",
    mapLabel: "Dressings Prod",
    className: "area-production",
    points: "47.3,36 75,36 75,53.2 47.3,53.2",
    labelX: 62,
    labelY: 44.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "logisticsqa-savoury",
    areaKey: "logisticsqaSavoury",
    label: "QA Savoury",
    mapLabel: "QA Savoury",
    className: "area-logisticsqa",
    points: "75.9,12 84,12 84,31.7 75.9,31.7",
    labelX: 80,
    labelY: 22,
    showLabel: true,
    showValue: true,
  },
  {
    id: "logisticsqa-dressings",
    areaKey: "logisticsqaDressings",
    label: "QA Dressings",
    mapLabel: "QA Dressings",
    className: "area-logisticsqa",
    points: "75,36 80.5,36 80.5,53.2 75,53.2",
    labelX: 78,
    labelY: 45,
    showLabel: true,
    showValue: true,
  },
  {
    id: "rd-main",
    areaKey: "rd",
    label: "R&D",
    mapLabel: "R&D",
    className: "area-rd",
    points: "33.8,23.2 38.2,23.2 38.2,33 33.8,33 33.8,28.3 33,28.3 33,25.8 33.8,25.8",
    labelX: 36,
    labelY: 28.5,
    showLabel: true,
    showValue: true,
  },
  {
    id: "engineering",
    areaKey: "engineering",
    label: "Engineering",
    mapLabel: "Engineering",
    className: "area-engineering",
    points: "28.6,44 40.7,44 40.7,51.6 28.6,51.6",
    labelX: 34.5,
    labelY: 48,
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

function formatMapTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function getPeopleForLegendArea(mapPeople, area, areaData = {}) {
  if (Array.isArray(areaData.people)) return areaData.people;

  const keys = new Set([area.key, area.dataKey].filter(Boolean));

  return (Array.isArray(mapPeople) ? mapPeople : [])
    .filter((person) => keys.has(person.areaKey))
    .filter((person) => person.isActiveInside || person.has24HourAlarm)
    .sort((a, b) => String(a.person || "").localeCompare(String(b.person || "")));
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
  const [selectedAreaKey, setSelectedAreaKey] = useState("");
  const [showPeoplePopup, setShowPeoplePopup] = useState(false);

  useEffect(() => {
    fetchMap?.();
  }, [fetchMap, workforceDate, group]);

  const areaLookup = useMemo(() => {
    return new Map((mapAreas || []).map((area) => [area.key, area]));
  }, [mapAreas]);

  const selectedArea = useMemo(() => {
    if (selectedAreaKey) {
      return AREA_META.find((area) => area.key === selectedAreaKey) || AREA_META[0];
    }

    return (
      AREA_META.find((area) => {
        const data = areaLookup.get(area.dataKey) || {};
        const people = getPeopleForLegendArea(mapPeople, area, data);
        return people.length > 0;
      }) || AREA_META[0]
    );
  }, [areaLookup, mapPeople, selectedAreaKey]);

  const selectedAreaData = selectedArea ? areaLookup.get(selectedArea.dataKey) || {} : {};
  const selectedAreaPeople = selectedArea
    ? getPeopleForLegendArea(mapPeople, selectedArea, selectedAreaData)
    : [];
  const selectedShownPeople = selectedAreaPeople.slice(0, 80);

  function selectLegendArea(areaKey) {
    setSelectedAreaKey(areaKey);
    setShowPeoplePopup(true);
  }

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

        <div className="map-mockup-shell" onMouseLeave={() => setShowPeoplePopup(false)}>
          <aside className="map-floating-legend">
            <div className="map-side-title">Legend</div>

            <div className="map-legend-list">
              {AREA_META.map((area) => {
                const data = areaLookup.get(area.dataKey) || {};
                return (
                  <button
                    type="button"
                    className={`map-legend-row map-legend-button ${area.className} ${
                      selectedArea?.key === area.key && showPeoplePopup ? "active" : ""
                    }`}
                    key={area.key}
                    onMouseEnter={() => selectLegendArea(area.key)}
                    onFocus={() => selectLegendArea(area.key)}
                    onClick={() => selectLegendArea(area.key)}
                  >
                    <span className={`map-legend-icon ${area.className}`}>{area.icon}</span>
                    <span className="map-legend-name">{area.label}</span>
                    <b>{Number(data.activeCount) || 0}</b>
                  </button>
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

                      {zone.showLabel ? (
                        <text
                          className="map-zone-area-label"
                          x={zone.labelX}
                          y={(zone.labelY || 0) - 3.2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {zone.mapLabel || zone.label}
                        </text>
                      ) : null}

                      {zone.showValue ? (
                        <text
                          className="map-zone-number"
                          x={zone.labelX}
                          y={(zone.labelY || 0) + 1.3}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {activeCount}
                        </text>
                      ) : null}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          <aside
            className={`map-people-floating-panel ${showPeoplePopup ? "is-open" : ""}`}
            onMouseEnter={() => setShowPeoplePopup(true)}
            onMouseLeave={() => setShowPeoplePopup(false)}
          >
            <div className="map-people-panel-header">
              <span>Selected Area</span>
              <h3>{selectedArea?.label || "Area"}</h3>
              <p>
                {selectedAreaPeople.length
                  ? `${selectedAreaPeople.length} person${selectedAreaPeople.length === 1 ? "" : "s"} still inside / no valid OUT`
                  : "No people with open/no-OUT status in this area."}
              </p>
            </div>

            <div className="map-people-panel-list">
              {selectedShownPeople.map((person, index) => (
                <div className="map-people-row" key={`${selectedArea?.key}-${person.person}-${index}`}>
                  <div>
                    <b>{person.person || "Unknown"}</b>
                    <span>{person.persongroup || "Unknown group"}</span>
                  </div>
                  <em>
                    {person.has24HourAlarm ? "24H No OUT" : "Inside"}
                    {person.scanIn ? ` · IN ${formatMapTime(person.scanIn)}` : ""}
                  </em>
                </div>
              ))}

              {!selectedAreaPeople.length ? (
                <div className="map-people-empty">
                  Hover another legend row to check that area.
                </div>
              ) : null}

              {selectedAreaPeople.length > selectedShownPeople.length ? (
                <div className="map-people-more">
                  +{selectedAreaPeople.length - selectedShownPeople.length} more people
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
