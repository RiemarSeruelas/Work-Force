import { useEffect, useState } from "react";
import AppShell from "../components/AppShell.jsx";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

function getHourBucket(row) {
  if (row?.hours_bucket) return row.hours_bucket;

  const value = Number(row?.work_hours) || 0;
  if (value >= 12) return "hours_12_plus";
  if (value > 10) return "hours_10_12";
  if (value > 8) return "hours_8_10";
  return "hours_8_or_less";
}

function getHourStatus(row) {
  const bucket = getHourBucket(row);

  if (row?.has_24h_alarm) return { label: "24H CAP", className: "bad cap" };
  if (bucket === "hours_12_plus") return { label: "12+ HRS", className: "bad" };
  if (bucket === "hours_10_12") return { label: "> 10 HRS", className: "orange" };
  if (bucket === "hours_8_10") return { label: "> 8 HRS", className: "warn" };
  return { label: "< 8 HRS", className: "ok" };
}

function fmt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function countLoadedRows(rows, bucketName) {
  return rows.filter((row) => getHourBucket(row) === bucketName).length;
}

export default function WorkforceDailyRecordPage() {
  const workforceDate = useWorkforceStore((s) => s.workforceDate);
  const setWorkforceDate = useWorkforceStore((s) => s.setWorkforceDate);
  const dailyDateMode = useWorkforceStore((s) => s.dailyDateMode);
  const setDailyDateMode = useWorkforceStore((s) => s.setDailyDateMode);
  const dailyDateFrom = useWorkforceStore((s) => s.dailyDateFrom);
  const setDailyDateFrom = useWorkforceStore((s) => s.setDailyDateFrom);
  const dailyDateTo = useWorkforceStore((s) => s.dailyDateTo);
  const setDailyDateTo = useWorkforceStore((s) => s.setDailyDateTo);
  const group = useWorkforceStore((s) => s.group);
  const setGroup = useWorkforceStore((s) => s.setGroup);
  const search = useWorkforceStore((s) => s.search);
  const setSearch = useWorkforceStore((s) => s.setSearch);
  const rows = useWorkforceStore((s) => s.dailyRows);
  const total = useWorkforceStore((s) => s.dailyTotal);
  const bucketTotals = useWorkforceStore((s) => s.dailyBucketTotals);
  const hasMore = useWorkforceStore((s) => s.dailyHasMore);
  const loadingMore = useWorkforceStore((s) => s.dailyLoadingMore);
  const loading = useWorkforceStore((s) => s.loading);
  const error = useWorkforceStore((s) => s.error);
  const fetchDailyRecord = useWorkforceStore((s) => s.fetchDailyRecord);
  const fetchDailyRecordNextPage = useWorkforceStore((s) => s.fetchDailyRecordNextPage);
  const [searchDraft, setSearchDraft] = useState(search);

  useEffect(() => {
    setSearchDraft(search);
  }, [search]);

  useEffect(() => {
    fetchDailyRecord?.({ reset: true });
  }, [fetchDailyRecord, workforceDate, dailyDateMode, dailyDateFrom, dailyDateTo, group]);

  function handleSearchSubmit(event) {
    event?.preventDefault?.();
    setSearch(searchDraft.trim());
    fetchDailyRecord?.({ reset: true });
  }

  function handleTableScroll(event) {
    const el = event.currentTarget;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 90;

    if (nearBottom && hasMore && !loading && !loadingMore) {
      fetchDailyRecordNextPage?.();
    }
  }

  const under8 = Number(bucketTotals?.hours_8_or_less ?? countLoadedRows(rows, "hours_8_or_less"));
  const over8 = Number(bucketTotals?.hours_8_10 ?? countLoadedRows(rows, "hours_8_10"));
  const over10 = Number(bucketTotals?.hours_10_12 ?? countLoadedRows(rows, "hours_10_12"));
  const over12 = Number(bucketTotals?.hours_12_plus ?? countLoadedRows(rows, "hours_12_plus"));
  const alarm24 = Number(bucketTotals?.hours_24h_alarm ?? rows.filter((row) => row.has_24h_alarm).length);

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
        { value: alarm24, label: "24H NO OUT", variant: "red" },
      ]}
    >
      <aside className="panel left-panel">
        <div className="panel-title">Filters</div>

        <label className="field-label">Date Scope</label>
        <select
          className="styled-input"
          value={dailyDateMode}
          onChange={(e) => setDailyDateMode(e.target.value)}
        >
          <option value="DAY">Single workforce date</option>
          <option value="HISTORY">Search history / date range</option>
        </select>

        {dailyDateMode === "HISTORY" ? (
          <div className="daily-history-date-grid">
            <label>
              <span className="field-label">From</span>
              <input
                className="styled-input"
                type="date"
                value={dailyDateFrom}
                onChange={(e) => setDailyDateFrom(e.target.value)}
              />
            </label>
            <label>
              <span className="field-label">To</span>
              <input
                className="styled-input"
                type="date"
                value={dailyDateTo || workforceDate}
                onChange={(e) => setDailyDateTo(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <>
            <label className="field-label">Workforce Date</label>
            <input
              className="styled-input"
              type="date"
              value={workforceDate}
              onChange={(e) => setWorkforceDate(e.target.value)}
            />
          </>
        )}

        <label className="field-label">Name / Department / ID</label>
        <input
          className="styled-input"
          value={searchDraft}
          onChange={(e) => setSearchDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSearchSubmit(e);
          }}
          placeholder="Search person..."
        />

        <label className="field-label">Group</label>
        <select className="styled-input" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="ALL">All Workforce</option>
          <option value="FTE">FTE</option>
          <option value="CONTRACTOR">Contractor</option>
        </select>

        <button className="primary-action-btn loading-aware-btn" onClick={handleSearchSubmit} disabled={loading}>
          {loading ? "Loading..." : "Search"}
        </button>

        {error && <div className="error-box">{error}</div>}
      </aside>

      <section className="panel center-panel workforce-center-span daily-record-panel-fit">
        <div className="table-card">
          <div className="table-title">Daily Working Hours · Loaded {rows.length} of {total}</div>

          <div className="data-table-wrap" onScroll={handleTableScroll}>
            <table className="data-table daily-record-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subgroup</th>
                  <th>Person</th>
                  <th>Scan In</th>
                  <th>Scan Out</th>
                  <th>Work Hours</th>
                  <th>Scan Count</th>
                  <th>Group</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.person_key}-${row.workforce_date || workforceDate}-${row.entry_time || ""}`}>
                    <td>{row.workforce_date || workforceDate}</td>
                    <td>{row.persongroup || "Unknown"}</td>
                    <td>
                      <span className="person-name-with-alarm">
                        <span>{row.person}</span>
                        {row.has_24h_alarm ? (
                          <span className="alarm-badge" title={row.alarm_reason || "No OUT within 24 hours"}>⚠ 24H</span>
                        ) : null}
                      </span>
                    </td>
                    <td>{fmt(row.entry_time)}</td>
                    <td>{row.exit_time ? fmt(row.exit_time) : <span className="muted-cell">No OUT</span>}</td>
                    <td>{row.has_24h_alarm ? "24.00" : Number(row.work_hours || 0).toFixed(2)}</td>
                    <td>{row.scan_count}</td>
                    <td>{row.workforce_group || "FTE"}</td>
                    <td>
                      {(() => {
                        const status = getHourStatus(row);
                        return <span className={`status-chip ${status.className}`}>{status.label}</span>;
                      })()}
                    </td>
                  </tr>
                ))}

                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan="9" className="empty-cell">Loading workforce records...</td>
                  </tr>
                )}

                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan="9" className="empty-cell">No workforce records found.</td>
                  </tr>
                )}

                {loadingMore && (
                  <tr>
                    <td colSpan="9" className="empty-cell loading-row">Loading 20 more records...</td>
                  </tr>
                )}

                {!loading && !loadingMore && rows.length > 0 && !hasMore && (
                  <tr>
                    <td colSpan="9" className="empty-cell">End of results · {rows.length} of {total}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
