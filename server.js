import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const { Pool } = pg;
const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json({ limit: "25mb" }));

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
});

const MANILA_TZ = "Asia/Manila";
const APP_PASSWORD = String(process.env.APP_PASSWORD || "Workforce2026").trim();
const DAY_MS = 24 * 60 * 60 * 1000;
const OUT_SCAN_LOOKAHEAD_DAYS = 1;
const MAX_WORK_HOURS_PER_PERSON = 24;
const MAX_WORK_INTERVAL_MS = MAX_WORK_HOURS_PER_PERSON * 60 * 60 * 1000;

function getManilaDateParts(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: MANILA_TZ }));
}

function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  date.setDate(date.getDate() + days);
  return formatDateOnly(date);
}

function getWorkforceDateManila(date = new Date()) {
  const manila = getManilaDateParts(date);
  if (manila.getHours() < 6) manila.setDate(manila.getDate() - 1);
  return formatDateOnly(manila);
}

function getCurrentIsoWeekManila() {
  const date = getManilaDateParts();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return {
    year: date.getFullYear(),
    week: 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7),
  };
}

function getWeekDateRangeManila(year, weekNo) {
  const firstThursday = new Date(Number(year), 0, 4);
  const firstMonday = new Date(firstThursday);
  firstMonday.setDate(firstThursday.getDate() - ((firstThursday.getDay() + 6) % 7));

  const monday = new Date(firstMonday);
  monday.setDate(firstMonday.getDate() + (Number(weekNo) - 1) * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: formatDateOnly(monday),
    endDate: formatDateOnly(sunday),
  };
}

function parsePaging(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 10000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
}

function parseCompliancePeoplePaging(req) {
  const rawLimit = req.query.peopleLimit;
  const parsedLimit = rawLimit === "0" ? 0 : parseInt(rawLimit, 10) || 20;
  const peopleLimit = Math.min(Math.max(parsedLimit, 0), 200);
  const peopleOffset = Math.max(parseInt(req.query.peopleOffset, 10) || 0, 0);
  return { peopleLimit, peopleOffset };
}

function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function isContractor(group) {
  return String(group || "").toLowerCase().includes("contract");
}

function groupAllowed(personGroup, groupValue) {
  const group = String(groupValue || "ALL").toUpperCase();
  if (group === "FTE") return !isContractor(personGroup);
  if (group === "CONTRACTOR") return isContractor(personGroup);
  return true;
}

function parseScanTs(value) {
  if (!value) return null;
  const text = String(value).replace(" ", "T");
  const date = new Date(`${text}+08:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatHHMM(ms) {
  if (!ms) return null;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const hour = parts.find((part) => part.type === "hour")?.value || "00";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  return `${hour}:${minute}`;
}

function startOfManilaDayMs(dateString) {
  return new Date(`${dateString}T00:00:00+08:00`).getTime();
}

function windowStartMs(workforceDate) {
  return new Date(`${workforceDate}T06:00:00+08:00`).getTime();
}

function windowEndMs(workforceDate) {
  return windowStartMs(workforceDate) + DAY_MS;
}

function calendarDateForMs(ms) {
  return formatDateOnly(getManilaDateParts(new Date(ms)));
}

function assignedWorkforceDateForInterval(startMs, endMs) {
  const startCalendarDate = calendarDateForMs(startMs);
  const currentDayStart = windowStartMs(startCalendarDate);

  // Early arrivals before 06:00 who exit after 06:00 belong to the new
  // workforce day, not the previous day. Example: 05:37 IN -> 16:00 OUT
  // counts on that calendar date and is not cut to 05:37-06:00.
  if (startMs < currentDayStart && endMs > currentDayStart) {
    return startCalendarDate;
  }

  return getWorkforceDateManila(new Date(startMs));
}

function periodStartForDate(dateString, period) {
  const date = new Date(`${dateString}T12:00:00+08:00`);
  if (period === "MONTHLY") {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  }
  if (period === "WEEKLY") {
    const day = date.getDay() || 7;
    date.setDate(date.getDate() - day + 1);
    return formatDateOnly(date);
  }
  return dateString;
}

function getModeDirection(row) {
  const mode = String(row?.l_mode ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\-_]+/g, " ");

  if (!mode) return null;

  // Prefer the semantic L_Mode text when it is available.
  if (/\b(exit|out|check out|clock out|leave|leaving|egress)\b/.test(mode)) return "OUT";
  if (/\b(entrance|entry|enter|in|check in|clock in|ingress)\b/.test(mode)) return "IN";

  return null;
}

function getTidDirection(row) {
  const tid = String(row?.l_tid ?? "").trim().toLowerCase();
  if (["1", "in", "entry", "enter", "entrance"].includes(tid)) return "IN";
  if (["0", "out", "exit", "leave"].includes(tid)) return "OUT";
  return null;
}

function getScanDirection(row) {
  const tidDirection = getTidDirection(row);
  const modeDirection = getModeDirection(row);
  const modeText = String(row?.l_mode ?? "").toLowerCase();
  const modeIsExplicit = /\b(entrance|entry|enter|ingress|exit|out|egress|leave)\b/.test(modeText);

  // Start with L_TID, but protect against lane IDs being mistaken as direction.
  // Example: a value related to Lane 1 should not override L_Mode = "Exit".
  if (tidDirection && modeDirection && tidDirection !== modeDirection && modeIsExplicit) {
    return modeDirection;
  }

  return tidDirection || modeDirection;
}

function isEntrance(row) {
  return getScanDirection(row) === "IN";
}

function isExit(row) {
  return getScanDirection(row) === "OUT";
}

async function testDb() {
  await pool.query("SELECT 1");
}

async function queryScans(fromDate, toDate, group = "ALL", search = "", options = {}) {
  // Pull from 00:00 of the first date so early arrivals before 06:00 are available
  // for the new workforce day. Still stop at 06:00 after the final date.
  const fromMs = startOfManilaDayMs(fromDate);
  const lookaheadDays = Math.max(Number(options.lookaheadDays) || 0, 0);
  const toMs = windowEndMs(toDate) + lookaheadDays * DAY_MS;
  const fromText = new Date(fromMs).toLocaleString("sv-SE", { timeZone: MANILA_TZ }).replace("T", " ");
  const toText = new Date(toMs).toLocaleString("sv-SE", { timeZone: MANILA_TZ }).replace("T", " ");
  const searchText = String(search || "").trim();

  const result = await pool.query(
    `
    SELECT
      "L_UID" AS l_uid,
      "Person" AS person,
      "PersonGroup" AS persongroup,
      "L_Mode" AS l_mode,
      "L_TID" AS l_tid,
      TO_CHAR(("C_Date"::date + "C_Time"::time), 'YYYY-MM-DD HH24:MI:SS') AS scan_ts_text
    FROM "hkvision"."tbhikvision"
    WHERE ("C_Date"::date + "C_Time"::time) >= $1::timestamp
      AND ("C_Date"::date + "C_Time"::time) <= $2::timestamp
      AND COALESCE(TRIM("Person"), '') <> ''
      AND (
        $3::text = ''
        OR LOWER(COALESCE("Person", '')) LIKE '%' || LOWER($3::text) || '%'
        OR LOWER(COALESCE("PersonGroup", '')) LIKE '%' || LOWER($3::text) || '%'
        OR LOWER(COALESCE("L_UID"::text, '')) LIKE '%' || LOWER($3::text) || '%'
      )
    ORDER BY "Person" ASC, ("C_Date"::date + "C_Time"::time) ASC
    `,
    [fromText, toText, searchText]
  );

  return result.rows
    .map((row) => {
      const parsed = parseScanTs(row.scan_ts_text);
      return parsed
        ? {
            ...row,
            person_key: normalizeName(row.person),
            scan_ms: parsed.getTime(),
            scan_iso: parsed.toISOString(),
            scan_direction: getScanDirection(row),
          }
        : null;
    })
    .filter(Boolean)
    .filter((row) => groupAllowed(row.persongroup, group));
}

function computeDailyRecords(scans, fromDate, toDate, now = new Date()) {
  const nowMs = now.getTime();
  const byDatePerson = new Map();
  const people = new Map();

  function getScanWorkforceDate(scan) {
    return getWorkforceDateManila(new Date(scan.scan_ms));
  }

  function getOpenIntervalCutoffMs(currentIn, nextScan = null) {
    const startDate = getWorkforceDateManila(new Date(currentIn.scan_ms));
    const workforceCutoffMs = windowEndMs(startDate);
    const capMs = currentIn.scan_ms + MAX_WORK_INTERVAL_MS;
    const nextScanMs = nextScan?.scan_ms || Number.POSITIVE_INFINITY;

    // When a new IN happens on a later workforce date, the old unclosed IN must
    // not keep running into the new visit. Stop it at the 06:00 workforce-day
    // boundary, capped at 24 hours as an absolute safety limit.
    return Math.min(workforceCutoffMs, capMs, nextScanMs);
  }

  function closeInterval({
    person,
    currentIn,
    outScan = null,
    countedEndMs,
    actualEndMs,
    hasOutScan,
    has24HourAlarm,
    closeReason = "",
  }) {
    if (!currentIn || !countedEndMs || countedEndMs <= currentIn.scan_ms) return;

    const assignedDate = assignedWorkforceDateForInterval(currentIn.scan_ms, countedEndMs);

    if (assignedDate < fromDate || assignedDate > toDate) return;

    const key = `${assignedDate}|${person.person_key}`;
    if (!byDatePerson.has(key)) {
      byDatePerson.set(key, {
        workforce_date: assignedDate,
        person_key: person.person_key,
        l_uid: person.l_uid,
        person: person.person,
        persongroup: person.persongroup || "Unknown",
        workforce_group: isContractor(person.persongroup) ? "CONTRACTOR" : "FTE",
        intervals: [],
        scan_count: 0,
        work_hours_raw: 0,
        has_out_scan: false,
        has_open_interval: false,
        has_24h_alarm: false,
      });
    }

    const row = byDatePerson.get(key);
    const intervalHours = Math.max(countedEndMs - currentIn.scan_ms, 0) / 3600000;
    const isOpenInterval = !hasOutScan;

    row.intervals.push({
      assignedDate,
      inScan: currentIn,
      outScan,
      startMs: currentIn.scan_ms,
      countedEndMs,
      actualEndMs: actualEndMs || countedEndMs,
      hasOutScan,
      has24HourAlarm,
      closeReason,
      intervalHours,
    });

    row.scan_count += hasOutScan ? 2 : 1;
    row.work_hours_raw += intervalHours;
    row.has_out_scan = row.has_out_scan || hasOutScan;
    row.has_open_interval = row.has_open_interval || isOpenInterval;
    row.has_24h_alarm = row.has_24h_alarm || has24HourAlarm || row.work_hours_raw > MAX_WORK_HOURS_PER_PERSON;

    if (!row.first_start_ms || currentIn.scan_ms < row.first_start_ms) row.first_start_ms = currentIn.scan_ms;
    if (!row.last_counted_end_ms || countedEndMs > row.last_counted_end_ms) row.last_counted_end_ms = countedEndMs;
    if (!row.latest_actual_scan_ms || (actualEndMs || countedEndMs) > row.latest_actual_scan_ms) row.latest_actual_scan_ms = actualEndMs || countedEndMs;

    if (hasOutScan && outScan && (!row.latest_out_scan_ms || outScan.scan_ms > row.latest_out_scan_ms)) {
      row.latest_out_scan_ms = outScan.scan_ms;
    }

    // This is the important display fix: when the day has a No OUT/open
    // interval, show the IN time of that actual open interval, not the first IN
    // of the day. Example: 10:01-11:30, 11:32-11:34, 13:28-No OUT displays
    // 13:28-No OUT in the compliance hover.
    if (isOpenInterval && (!row.latest_open_start_ms || currentIn.scan_ms > row.latest_open_start_ms)) {
      row.latest_open_start_ms = currentIn.scan_ms;
    }
  }

  for (const scan of scans) {
    if (!scan.person_key) continue;
    if (!people.has(scan.person_key)) {
      people.set(scan.person_key, {
        person_key: scan.person_key,
        l_uid: scan.l_uid,
        person: scan.person,
        persongroup: scan.persongroup,
        scans: [],
      });
    }

    const person = people.get(scan.person_key);
    person.scans.push(scan);

    if (scan.scan_ms >= (person.latest_seen_scan_ms || 0)) {
      person.latest_seen_scan_ms = scan.scan_ms;
      person.l_uid = scan.l_uid || person.l_uid;
      person.person = scan.person || person.person;
      person.persongroup = scan.persongroup || person.persongroup;
    }
  }

  for (const person of people.values()) {
    person.scans.sort((a, b) => a.scan_ms - b.scan_ms);
    let currentIn = null;

    for (const scan of person.scans) {
      const direction = getScanDirection(scan);

      if (direction === "IN") {
        if (!currentIn) {
          currentIn = scan;
          continue;
        }

        const sameWorkforceDate = getScanWorkforceDate(scan) === getScanWorkforceDate(currentIn);
        const elapsedMs = scan.scan_ms - currentIn.scan_ms;

        if (!sameWorkforceDate) {
          const countedEndMs = getOpenIntervalCutoffMs(currentIn, scan);
          const cappedAt24 = countedEndMs >= currentIn.scan_ms + MAX_WORK_INTERVAL_MS;

          closeInterval({
            person,
            currentIn,
            countedEndMs,
            actualEndMs: countedEndMs,
            hasOutScan: false,
            has24HourAlarm: cappedAt24,
            closeReason: cappedAt24 ? "No OUT within 24 hours" : "New IN on next workforce day",
          });

          // The new IN is a real new visit, not a duplicate of yesterday.
          currentIn = scan;
          continue;
        }

        if (elapsedMs >= MAX_WORK_INTERVAL_MS) {
          closeInterval({
            person,
            currentIn,
            countedEndMs: currentIn.scan_ms + MAX_WORK_INTERVAL_MS,
            actualEndMs: currentIn.scan_ms + MAX_WORK_INTERVAL_MS,
            hasOutScan: false,
            has24HourAlarm: true,
            closeReason: "No OUT within 24 hours",
          });
          currentIn = scan;
          continue;
        }

        // Same workforce day duplicate IN: keep the original IN. This handles
        // repeated lane scans without resetting the work interval.
        continue;
      }

      if (direction === "OUT") {
        // Orphan OUT scans are ignored. This prevents an OUT scan from becoming
        // the beginning of a fake interval.
        if (!currentIn || scan.scan_ms <= currentIn.scan_ms) continue;

        const elapsedMs = scan.scan_ms - currentIn.scan_ms;

        if (elapsedMs <= MAX_WORK_INTERVAL_MS) {
          closeInterval({
            person,
            currentIn,
            outScan: scan,
            countedEndMs: scan.scan_ms,
            actualEndMs: scan.scan_ms,
            hasOutScan: true,
            has24HourAlarm: false,
            closeReason: "Matched OUT scan",
          });
        } else {
          // OUT came too late. Stop at 24 hours and keep the record as No OUT.
          // The late OUT is ignored as a stale/out-of-window scan.
          closeInterval({
            person,
            currentIn,
            countedEndMs: currentIn.scan_ms + MAX_WORK_INTERVAL_MS,
            actualEndMs: currentIn.scan_ms + MAX_WORK_INTERVAL_MS,
            hasOutScan: false,
            has24HourAlarm: true,
            closeReason: "No OUT within 24 hours",
          });
        }

        currentIn = null;
      }
    }

    if (currentIn) {
      const elapsedToNowMs = Math.max(nowMs - currentIn.scan_ms, 0);
      const shouldCapAt24 = elapsedToNowMs >= MAX_WORK_INTERVAL_MS;
      const countedEndMs = currentIn.scan_ms + Math.min(elapsedToNowMs, MAX_WORK_INTERVAL_MS);

      if (countedEndMs > currentIn.scan_ms) {
        closeInterval({
          person,
          currentIn,
          countedEndMs,
          actualEndMs: countedEndMs,
          hasOutScan: false,
          has24HourAlarm: shouldCapAt24,
          closeReason: shouldCapAt24 ? "No OUT within 24 hours" : "Currently inside / no OUT yet",
        });
      }
    }
  }

  return [...byDatePerson.values()]
    .map((row) => {
      const cappedWorkHoursRaw = Math.min(Number(row.work_hours_raw) || 0, MAX_WORK_HOURS_PER_PERSON);
      const has24HourAlarm = Boolean(row.has_24h_alarm || row.work_hours_raw > MAX_WORK_HOURS_PER_PERSON);
      const hasOpenInterval = Boolean(row.has_open_interval || row.latest_open_start_ms);
      const displayStartMs = hasOpenInterval ? row.latest_open_start_ms : row.first_start_ms;
      const displayOutScanMs = hasOpenInterval ? null : row.latest_out_scan_ms;

      return {
        workforce_date: row.workforce_date,
        person_key: row.person_key,
        l_uid: row.l_uid,
        person: row.person,
        persongroup: row.persongroup || "Unknown",
        workforce_group: row.workforce_group,
        entry_time: new Date(row.first_start_ms).toISOString(),
        display_entry_time: displayStartMs ? new Date(displayStartMs).toISOString() : new Date(row.first_start_ms).toISOString(),
        last_scan: new Date(row.latest_actual_scan_ms || row.last_counted_end_ms).toISOString(),
        exit_time: displayOutScanMs ? new Date(displayOutScanMs).toISOString() : null,
        scan_count: row.scan_count,
        has_out_scan: hasOpenInterval ? false : row.has_out_scan,
        has_open_interval: hasOpenInterval,
        has_24h_alarm: has24HourAlarm,
        alarm_reason: has24HourAlarm ? "No OUT within 24 hours" : hasOpenInterval ? "No OUT scan found before the next workforce day" : null,
        work_hours_raw: cappedWorkHoursRaw,
        work_hours: Number(cappedWorkHoursRaw.toFixed(2)),
        hours_bucket: cappedWorkHoursRaw >= 12 ? "hours_12_plus" : cappedWorkHoursRaw > 10 ? "hours_10_12" : cappedWorkHoursRaw > 8 ? "hours_8_10" : "hours_8_or_less",
        counted_day: cappedWorkHoursRaw > 4,
      };
    })
    .sort((a, b) => {
      const groupDiff = String(a.persongroup || "").localeCompare(String(b.persongroup || ""));
      if (groupDiff !== 0) return groupDiff;
      return String(a.person || "").localeCompare(String(b.person || ""));
    });
}

function summarizeDailyForTrend(daily, period) {
  const periodPeople = new Map();

  for (const row of daily) {
    const periodStart = periodStartForDate(row.workforce_date, period);
    const key = `${periodStart}|${row.person_key}`;
    if (!periodPeople.has(key)) {
      periodPeople.set(key, {
        period_start: periodStart,
        person_key: row.person_key,
        total_hours: 0,
        working_days: 0,
      });
    }
    const item = periodPeople.get(key);
    item.total_hours += Number(row.work_hours_raw) || 0;
    if (row.counted_day) item.working_days += 1;
  }

  const periods = new Map();
  for (const person of periodPeople.values()) {
    if (!periods.has(person.period_start)) {
      periods.set(person.period_start, {
        period_start: person.period_start,
        population: 0,
        hours_8_or_less: 0,
        hours_8_10: 0,
        hours_10_12: 0,
        hours_12_plus: 0,
        days_1: 0,
        days_2: 0,
        days_3: 0,
        days_4: 0,
        days_5: 0,
        days_6: 0,
        days_7: 0,
        total_hours_sum: 0,
        total_days_sum: 0,
      });
    }
    const periodRow = periods.get(person.period_start);
    periodRow.population += 1;
    periodRow.total_hours_sum += person.total_hours;
    periodRow.total_days_sum += person.working_days;

    if (person.total_hours >= 12) periodRow.hours_12_plus += 1;
    else if (person.total_hours > 10) periodRow.hours_10_12 += 1;
    else if (person.total_hours > 8) periodRow.hours_8_10 += 1;
    else periodRow.hours_8_or_less += 1;

    const dayBucket = Math.min(Math.max(person.working_days, 1), 7);
    periodRow[`days_${dayBucket}`] += 1;
  }

  return [...periods.values()]
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
    .map((row) => ({
      ...row,
      average_hours: row.population ? Number((row.total_hours_sum / row.population).toFixed(2)) : 0,
      average_days: row.population ? Number((row.total_days_sum / row.population).toFixed(2)) : 0,
    }));
}

const WORKFORCE_MAP_AREAS = [
  {
    key: "engineering",
    label: "Engineering",
    keywords: ["engineering", "maintenance", "automation", "electrical", "mechanical", "instrument", "technician", "project"],
  },
  {
    key: "production",
    label: "Production",
    keywords: ["production", "process", "packing", "packaging", "dressing", "dressings", "savoury", "condiments", "operator", "line", "filler", "mespack", "volpak", "fd", "cl"],
  },
  {
    key: "warehouse",
    label: "Warehouse",
    keywords: ["warehouse", "logistics", "material", "store", "stores", "receiving", "dispatch", "rm", "pm", "fg", "forklift", "inventory"],
  },
  {
    key: "utilities",
    label: "Utilities",
    keywords: ["utilities", "utility", "boiler", "compressor", "refrigeration", "wastewater", "waste water", "water", "power", "substation", "wwtp", "chiller", "cooling"],
  },
  {
    key: "admin",
    label: "Admin",
    keywords: ["admin", "office", "hr", "finance", "quality", "qa", "qc", "r&d", "rnd", "lab", "laboratory", "ehs", "hse", "safety", "security"],
  },
  {
    key: "other",
    label: "Other",
    keywords: [],
  },
];

function makeMapAreaLookup() {
  return new Map(
    WORKFORCE_MAP_AREAS.map((area) => [
      area.key,
      {
        key: area.key,
        label: area.label,
        activeCount: 0,
        totalToday: 0,
        exitedCount: 0,
        alarmCount: 0,
        groups: {},
      },
    ])
  );
}

function classifyMapArea(row) {
  const text = `${row?.persongroup || ""} ${row?.person || ""}`.toLowerCase();

  for (const area of WORKFORCE_MAP_AREAS) {
    if (area.key === "other") continue;
    if (area.keywords.some((word) => text.includes(word))) return area.key;
  }

  return "production";
}

function compactAreaGroups(groups) {
  return Object.entries(groups || {})
    .map(([name, value]) => ({ name, value: Number(value) || 0 }))
    .filter((row) => row.value > 0)
    .sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name))
    .slice(0, 5);
}


app.get("/api/health", async (_req, res) => {
  try {
    await testDb();
    res.json({ ok: true, db: "connected" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/passcode", (req, res) => {
  const enteredPasscode = String(req.body?.passcode || "").trim();

  if (enteredPasscode !== APP_PASSWORD) {
    return res.status(401).json({ error: "Invalid passcode" });
  }

  res.json({ success: true, token: "passcode-ok" });
});

app.get("/api/workforce/summary", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const group = String(req.query.group || "ALL");
    const periodRaw = String(req.query.period || "DAILY").toUpperCase();
    const period = ["DAILY", "WEEKLY", "MONTHLY"].includes(periodRaw) ? periodRaw : "DAILY";
    const startDate = period === "MONTHLY" ? addDays(workforceDate, -185) : period === "WEEKLY" ? addDays(workforceDate, -56) : addDays(workforceDate, -13);

    const scans = await queryScans(startDate, workforceDate, group, "", { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    const daily = computeDailyRecords(scans, startDate, workforceDate);
    const selectedDaily = daily.filter((row) => row.workforce_date === workforceDate);
    const latestScanMs = selectedDaily.reduce((max, row) => {
      const rowLastScanMs = row.last_scan ? new Date(row.last_scan).getTime() : 0;
      return Math.max(max, Number.isNaN(rowLastScanMs) ? 0 : rowLastScanMs);
    }, 0);

    const daysPeriod = period === "DAILY" ? "WEEKLY" : period;

    res.json({
      workforceDate,
      group,
      period,
      totalPeople: selectedDaily.length,
      countedDays: selectedDaily.filter((row) => row.counted_day).length,
      greaterThan8Hours: selectedDaily.filter((row) => row.work_hours_raw > 8 && row.work_hours_raw <= 10).length,
      greaterThan10Hours: selectedDaily.filter((row) => row.work_hours_raw > 10 && row.work_hours_raw < 12).length,
      greaterThan12Hours: selectedDaily.filter((row) => row.work_hours_raw >= 12).length,
      latestScan: latestScanMs ? new Date(latestScanMs).toISOString() : null,
      timeSeries: summarizeDailyForTrend(daily, period),
      daysPeriod,
      daysTimeSeries: summarizeDailyForTrend(daily, daysPeriod),
      dayRule: "L_TID determines IN and OUT first. L_Mode is only used as fallback. The workforce day is 06:00-05:59. Same-workforce-day duplicate IN scans do not reset the interval. An IN on the next workforce day closes the previous open interval at the 06:00 boundary and starts a new visit. Cross-midnight work with a valid OUT still counts back to the original IN workforce date. A person is capped at 24 hours if no valid OUT scan is found within 24 hours. More than 4 hours counts as 1 working day.",
    });
  } catch (err) {
    console.error("❌ WORKFORCE SUMMARY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/daily-record", async (req, res) => {
  try {
    const mode = String(req.query.mode || "DAY").toUpperCase();
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const requestedFrom = String(req.query.from || "").trim();
    const requestedTo = String(req.query.to || "").trim();
    const search = String(req.query.search || "").trim().toLowerCase();
    const group = String(req.query.group || "ALL");
    const { limit, offset } = parsePaging(req);

    const isHistoryMode = mode === "HISTORY";
    const fromDate = isHistoryMode ? (requestedFrom || "1970-01-01") : workforceDate;
    const toDate = isHistoryMode ? (requestedTo || workforceDate) : workforceDate;

    const scans = await queryScans(fromDate, toDate, group, search, { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    let rows = computeDailyRecords(scans, fromDate, toDate);

    // Safety filter after interval computation. The DB query already narrows the scan rows,
    // but this keeps the response correct if more searchable fields are added later.
    if (search) {
      rows = rows.filter((row) =>
        String(row.person || "").toLowerCase().includes(search) ||
        String(row.persongroup || "").toLowerCase().includes(search) ||
        String(row.l_uid || "").toLowerCase().includes(search)
      );
    }

    rows.sort((a, b) => {
      const dateDiff = String(b.workforce_date || "").localeCompare(String(a.workforce_date || ""));
      if (dateDiff !== 0) return dateDiff;
      return String(a.person || "").localeCompare(String(b.person || ""));
    });

    const total = rows.length;
    const bucketTotals = rows.reduce(
      (acc, row) => {
        const bucket = row.hours_bucket || "hours_8_or_less";
        acc[bucket] = (Number(acc[bucket]) || 0) + 1;
        if (row.has_24h_alarm) acc.hours_24h_alarm += 1;
        return acc;
      },
      {
        hours_8_or_less: 0,
        hours_8_10: 0,
        hours_10_12: 0,
        hours_12_plus: 0,
        hours_24h_alarm: 0,
      }
    );
    const pagedRows = rows.slice(offset, offset + limit);

    res.json({
      workforceDate,
      fromDate,
      toDate,
      mode: isHistoryMode ? "HISTORY" : "DAY",
      group,
      search,
      rows: pagedRows,
      total,
      bucketTotals,
      limit,
      offset,
      hasMore: offset + pagedRows.length < total,
    });
  } catch (err) {
    console.error("❌ WORKFORCE DAILY RECORD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/compliance", async (req, res) => {
  try {
    const currentWeek = getCurrentIsoWeekManila();
    const year = Number(req.query.year || currentWeek.year);
    const week = Number(req.query.week || currentWeek.week);
    const group = String(req.query.group || "ALL");
    const selectedCategory = String(req.query.category || "").trim();
    const selectedPersongroup = String(req.query.persongroup || "").trim();
    const { peopleLimit, peopleOffset } = parseCompliancePeoplePaging(req);
    const { startDate, endDate } = getWeekDateRangeManila(year, week);

    const scans = await queryScans(startDate, endDate, group, "", { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    const dailyRaw = computeDailyRecords(scans, startDate, endDate);
    const daily = dailyRaw.filter((row) => row.work_hours_raw > 4);

    const personMap = new Map();
    for (const day of daily) {
      if (!personMap.has(day.person_key)) {
        personMap.set(day.person_key, {
          person_key: day.person_key,
          person: day.person,
          persongroup: day.persongroup || "Unknown",
          working_days: 0,
          total_hours: 0,
          has_24h_alarm: false,
          alarm_days: 0,
        });
      }
      const person = personMap.get(day.person_key);
      person.person = day.person || person.person;
      person.persongroup = day.persongroup || person.persongroup;
      person.working_days += 1;
      person.total_hours += Number(day.work_hours_raw) || 0;
      if (day.has_24h_alarm) {
        person.has_24h_alarm = true;
        person.alarm_days += 1;
      }
    }

    const weekDayMap = new Map();
    for (const day of dailyRaw) {
      if (!weekDayMap.has(day.person_key)) weekDayMap.set(day.person_key, []);
      weekDayMap.get(day.person_key).push({
        date: day.workforce_date,
        hours: day.work_hours,
        firstScan: formatHHMM(new Date(day.display_entry_time || day.entry_time).getTime()),
        lastScan: day.exit_time ? formatHHMM(new Date(day.exit_time).getTime()) : null,
        hasOutScan: Boolean(day.exit_time),
        countedDay: day.work_hours_raw > 4,
        has24HourAlarm: Boolean(day.has_24h_alarm),
      });
    }

    const peopleAll = [...personMap.values()]
      .map((person) => {
        const totalHours = Number(person.total_hours.toFixed(2));
        const workingDays = person.working_days;
        return {
          ...person,
          total_hours: totalHours,
          working_days: workingDays,
          has_24h_alarm: Boolean(person.has_24h_alarm),
          alarm_days: Number(person.alarm_days) || 0,
          week_days: weekDayMap.get(person.person_key) || [],
          hours_category: totalHours > 60 ? "greater_than_60_hours" : totalHours >= 40 ? "hours_40_60" : "less_than_40_hours",
          days_category: workingDays > 6 ? "greater_than_6_days" : workingDays >= 5 ? "days_5_6" : "days_less_than_5",
        };
      })
      .sort((a, b) => {
        const hoursDiff = (Number(b.total_hours) || 0) - (Number(a.total_hours) || 0);
        if (hoursDiff !== 0) return hoursDiff;
        return String(a.person || "").localeCompare(String(b.person || ""));
      });

    const subgroupMap = new Map();
    for (const person of peopleAll) {
      const groupName = person.persongroup || "Unknown";
      if (!subgroupMap.has(groupName)) {
        subgroupMap.set(groupName, {
          persongroup: groupName,
          population: 0,
          greater_than_60_hours: 0,
          hours_40_60: 0,
          less_than_40_hours: 0,
          greater_than_6_days: 0,
          days_5_6: 0,
          days_less_than_5: 0,
          hours_sum: 0,
          days_sum: 0,
          alarm_count: 0,
          greater_than_60_hours_alarm_count: 0,
          hours_40_60_alarm_count: 0,
          less_than_40_hours_alarm_count: 0,
          greater_than_6_days_alarm_count: 0,
          days_5_6_alarm_count: 0,
          days_less_than_5_alarm_count: 0,
        });
      }
      const row = subgroupMap.get(groupName);
      row.population += 1;
      row[person.hours_category] += 1;
      row[person.days_category] += 1;
      row.hours_sum += Number(person.total_hours) || 0;
      row.days_sum += Number(person.working_days) || 0;
      if (person.has_24h_alarm) {
        row.alarm_count += 1;
        row[`${person.hours_category}_alarm_count`] += 1;
        row[`${person.days_category}_alarm_count`] += 1;
      }
    }

    const rows = [...subgroupMap.values()]
      .filter((row) => (Number(row.population) || 0) > 0)
      .map((row) => ({
        ...row,
        avg_hours: row.population ? Number((row.hours_sum / row.population).toFixed(2)) : 0,
        avg_days: row.population ? Number((row.days_sum / row.population).toFixed(2)) : 0,
      }))
      .sort((a, b) => (b.population - a.population) || String(a.persongroup).localeCompare(String(b.persongroup)));

    const totals = rows.reduce(
      (acc, row) => {
        acc.population += Number(row.population) || 0;
        acc.greaterThan60Hours += Number(row.greater_than_60_hours) || 0;
        acc.hours40To60 += Number(row.hours_40_60) || 0;
        acc.lessThan40Hours += Number(row.less_than_40_hours) || 0;
        acc.nonCompliantWorkingDays += Number(row.greater_than_6_days) || 0;
        acc.days5To6 += Number(row.days_5_6) || 0;
        acc.daysLessThan5 += Number(row.days_less_than_5) || 0;
        acc.alarmCount += Number(row.alarm_count) || 0;
        return acc;
      },
      {
        population: 0,
        greaterThan60Hours: 0,
        hours40To60: 0,
        lessThan40Hours: 0,
        nonCompliantWorkingDays: 0,
        days5To6: 0,
        daysLessThan5: 0,
        alarmCount: 0,
      }
    );

    const filteredPeople = peopleAll.filter((person) => {
      const categoryMatches = !selectedCategory || person.hours_category === selectedCategory || person.days_category === selectedCategory;
      const groupMatches = !selectedPersongroup || person.persongroup === selectedPersongroup;
      return categoryMatches && groupMatches;
    });

    const peopleTotal = filteredPeople.length;
    const pagedPeople = peopleLimit > 0 ? filteredPeople.slice(peopleOffset, peopleOffset + peopleLimit) : [];

    res.json({
      year,
      week,
      group,
      startDate,
      endDate,
      dayRule: "L_TID determines IN and OUT first. L_Mode is only used as fallback. Same-workforce-day duplicate IN scans do not reset the interval. An IN on the next workforce day closes the previous open interval at the 06:00 boundary and starts a new visit. Cross-midnight work with a valid OUT still counts back to the original IN workforce date. A person is capped at 24 hours if no valid OUT scan is found within 24 hours. > 4 hours counts as 1 working day.",
      totals,
      rows,
      people: pagedPeople,
      peopleTotal,
      peopleLimit,
      peopleOffset,
      peopleHasMore: peopleOffset + pagedPeople.length < peopleTotal,
      selectedCategory,
      selectedPersongroup,
    });
  } catch (err) {
    console.error("❌ WORKFORCE COMPLIANCE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/map", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const group = String(req.query.group || "ALL");
    const scans = await queryScans(workforceDate, workforceDate, group, "", { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    const daily = computeDailyRecords(scans, workforceDate, workforceDate);
    const areasByKey = makeMapAreaLookup();
    const latestScanMs = scans.reduce((max, scan) => Math.max(max, Number(scan.scan_ms) || 0), 0);
    const people = [];

    for (const row of daily) {
      const areaKey = classifyMapArea(row);
      const area = areasByKey.get(areaKey) || areasByKey.get("other");
      const isActiveInside = Boolean(row.has_open_interval && !row.has_24h_alarm);
      const groupName = row.persongroup || "Unknown";

      area.totalToday += 1;
      if (isActiveInside) area.activeCount += 1;
      else area.exitedCount += 1;
      if (row.has_24h_alarm) area.alarmCount += 1;
      area.groups[groupName] = (Number(area.groups[groupName]) || 0) + 1;

      people.push({
        person: row.person,
        persongroup: row.persongroup || "Unknown",
        areaKey,
        areaLabel: area.label,
        isActiveInside,
        has24HourAlarm: Boolean(row.has_24h_alarm),
        scanIn: row.display_entry_time || row.entry_time,
        scanOut: row.exit_time,
        workHours: row.work_hours,
      });
    }

    const areas = [...areasByKey.values()]
      .map((area) => ({
        ...area,
        groups: compactAreaGroups(area.groups),
      }))
      .filter((area) => area.key !== "other" || area.totalToday > 0);

    res.json({
      workforceDate,
      group,
      summary: {
        totalToday: daily.length,
        activeInside: areas.reduce((sum, area) => sum + (Number(area.activeCount) || 0), 0),
        occupiedAreas: areas.filter((area) => (Number(area.activeCount) || 0) > 0).length,
        alarmCount: areas.reduce((sum, area) => sum + (Number(area.alarmCount) || 0), 0),
        latestScan: latestScanMs ? new Date(latestScanMs).toISOString() : null,
        countMode: "Active inside = people with IN scan and no valid OUT yet, capped at 24 hours.",
      },
      areas,
      people: people
        .sort((a, b) => String(a.areaLabel).localeCompare(String(b.areaLabel)) || String(a.person).localeCompare(String(b.person)))
        .slice(0, 250),
    });
  } catch (err) {
    console.error("❌ WORKFORCE MAP ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/workforce/population", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const scans = await queryScans(workforceDate, workforceDate, "ALL", "", { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    const daily = computeDailyRecords(scans, workforceDate, workforceDate);
    const groupMap = new Map();

    for (const row of daily) {
      const key = row.persongroup || "Unknown";
      groupMap.set(key, (groupMap.get(key) || 0) + 1);
    }

    const rows = [...groupMap.entries()]
      .map(([persongroup, population]) => ({ persongroup, population }))
      .sort((a, b) => (b.population - a.population) || String(a.persongroup).localeCompare(String(b.persongroup)));

    res.json({ workforceDate, rows });
  } catch (err) {
    console.error("❌ WORKFORCE POPULATION ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.use(express.static(path.join(__dirname, "dist")));
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();

  const indexPath = path.join(__dirname, "dist", "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  return res.status(404).send("React build not found. In development, open the Vite URL instead: http://localhost:5173");
});

const PORT = Number(process.env.PORT) || 5056;
app.listen(PORT, () => {
  console.log(`🚀 Workforce backend running on http://localhost:${PORT}`);
});
