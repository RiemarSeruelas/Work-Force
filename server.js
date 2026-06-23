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
  const modeDirection = getModeDirection(row);
  const tidDirection = getTidDirection(row);

  // If both fields exist but conflict, keep L_Mode as source of truth because it
  // explicitly says Entrance/Exit. L_TID stays as fallback for numeric-only rows.
  return modeDirection || tidDirection;
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
    const intervals = [];
    let currentIn = null;

    for (const scan of person.scans) {
      const direction = getScanDirection(scan);

      if (direction === "IN") {
        // Duplicate IN scans before a valid OUT are ignored so the first IN remains
        // the start of the work interval.
        if (!currentIn) currentIn = scan;
        continue;
      }

      if (direction === "OUT") {
        // Orphan OUT scans are ignored. This prevents 06:00 OUT + 15:00 IN from
        // becoming a fake 06:00-15:00 interval.
        if (currentIn && scan.scan_ms > currentIn.scan_ms) {
          const assignedDate = assignedWorkforceDateForInterval(currentIn.scan_ms, scan.scan_ms);
          // For a real OUT scan, count until the actual OUT time even if it lands
          // after the 06:00 workforce cutoff or in the next ISO week. Example:
          // Sunday 15:00 IN -> Monday 06:30 OUT still belongs to Sunday.
          const countedEndMs = scan.scan_ms;

          if (countedEndMs > currentIn.scan_ms) {
            intervals.push({
              assignedDate,
              inScan: currentIn,
              outScan: scan,
              startMs: currentIn.scan_ms,
              countedEndMs,
              actualEndMs: scan.scan_ms,
              hasOutScan: true,
            });
          }

          currentIn = null;
        }
      }
    }

    if (currentIn) {
      // No OUT yet: close the record at now if the interval is active, otherwise at
      // the workforce-day cutoff. Early arrivals still use the assigned day rule.
      const provisionalEndMs = Math.max(nowMs, currentIn.scan_ms);
      const assignedDate = assignedWorkforceDateForInterval(currentIn.scan_ms, provisionalEndMs);
      const assignedEndMs = windowEndMs(assignedDate);
      const activeNow = nowMs >= currentIn.scan_ms && nowMs < assignedEndMs;
      const countedEndMs = activeNow ? nowMs : assignedEndMs;

      if (countedEndMs > currentIn.scan_ms) {
        intervals.push({
          assignedDate,
          inScan: currentIn,
          outScan: null,
          startMs: currentIn.scan_ms,
          countedEndMs,
          actualEndMs: countedEndMs,
          hasOutScan: false,
        });
      }
    }

    for (const interval of intervals) {
      if (interval.assignedDate < fromDate || interval.assignedDate > toDate) continue;

      const key = `${interval.assignedDate}|${person.person_key}`;
      if (!byDatePerson.has(key)) {
        byDatePerson.set(key, {
          workforce_date: interval.assignedDate,
          person_key: person.person_key,
          l_uid: person.l_uid,
          person: person.person,
          persongroup: person.persongroup || "Unknown",
          workforce_group: isContractor(person.persongroup) ? "CONTRACTOR" : "FTE",
          intervals: [],
          scan_count: 0,
          work_hours_raw: 0,
          has_out_scan: false,
        });
      }

      const row = byDatePerson.get(key);
      row.intervals.push(interval);
      row.scan_count += interval.hasOutScan ? 2 : 1;
      row.work_hours_raw += Math.max(interval.countedEndMs - interval.startMs, 0) / 3600000;
      row.has_out_scan = row.has_out_scan || interval.hasOutScan;

      if (!row.first_start_ms || interval.startMs < row.first_start_ms) row.first_start_ms = interval.startMs;
      if (!row.last_counted_end_ms || interval.countedEndMs > row.last_counted_end_ms) row.last_counted_end_ms = interval.countedEndMs;
      if (!row.latest_actual_scan_ms || interval.actualEndMs > row.latest_actual_scan_ms) row.latest_actual_scan_ms = interval.actualEndMs;
      if (interval.outScan && (!row.latest_out_scan_ms || interval.outScan.scan_ms > row.latest_out_scan_ms)) {
        row.latest_out_scan_ms = interval.outScan.scan_ms;
      }
    }
  }

  return [...byDatePerson.values()]
    .map((row) => ({
      workforce_date: row.workforce_date,
      person_key: row.person_key,
      l_uid: row.l_uid,
      person: row.person,
      persongroup: row.persongroup || "Unknown",
      workforce_group: row.workforce_group,
      entry_time: new Date(row.first_start_ms).toISOString(),
      last_scan: new Date(row.latest_actual_scan_ms || row.last_counted_end_ms).toISOString(),
      exit_time: row.latest_out_scan_ms ? new Date(row.latest_out_scan_ms).toISOString() : null,
      scan_count: row.scan_count,
      has_out_scan: row.has_out_scan,
      work_hours_raw: row.work_hours_raw,
      work_hours: Number(row.work_hours_raw.toFixed(2)),
      hours_bucket: row.work_hours_raw >= 12 ? "hours_12_plus" : row.work_hours_raw > 10 ? "hours_10_12" : row.work_hours_raw > 8 ? "hours_8_10" : "hours_8_or_less",
      counted_day: row.work_hours_raw > 4,
    }))
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
      dayRule: "L_Mode/L_TID determines IN and OUT. The workforce day is 06:00-05:59. Cross-midnight work is counted back to the original IN workforce date, even when the OUT scan is after 06:00 or in the next ISO week. Early arrivals before 06:00 are kept with the new day when they exit after 06:00. More than 4 hours counts as 1 working day.",
    });
  } catch (err) {
    console.error("❌ WORKFORCE SUMMARY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/daily-record", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const search = String(req.query.search || "").trim().toLowerCase();
    const group = String(req.query.group || "ALL");
    const { limit, offset } = parsePaging(req);

    const scans = await queryScans(workforceDate, workforceDate, group, search, { lookaheadDays: OUT_SCAN_LOOKAHEAD_DAYS });
    let rows = computeDailyRecords(scans, workforceDate, workforceDate);

    // Safety filter after interval computation. The DB query already narrows the scan rows,
    // but this keeps the response correct if more searchable fields are added later.
    if (search) {
      rows = rows.filter((row) =>
        String(row.person || "").toLowerCase().includes(search) ||
        String(row.persongroup || "").toLowerCase().includes(search) ||
        String(row.l_uid || "").toLowerCase().includes(search)
      );
    }

    rows.sort((a, b) => String(a.person || "").localeCompare(String(b.person || "")));
    const total = rows.length;
    const bucketTotals = rows.reduce(
      (acc, row) => {
        const bucket = row.hours_bucket || "hours_8_or_less";
        acc[bucket] = (Number(acc[bucket]) || 0) + 1;
        return acc;
      },
      {
        hours_8_or_less: 0,
        hours_8_10: 0,
        hours_10_12: 0,
        hours_12_plus: 0,
      }
    );
    const pagedRows = rows.slice(offset, offset + limit);

    res.json({
      workforceDate,
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
        });
      }
      const person = personMap.get(day.person_key);
      person.person = day.person || person.person;
      person.persongroup = day.persongroup || person.persongroup;
      person.working_days += 1;
      person.total_hours += Number(day.work_hours_raw) || 0;
    }

    const weekDayMap = new Map();
    for (const day of dailyRaw) {
      if (!weekDayMap.has(day.person_key)) weekDayMap.set(day.person_key, []);
      weekDayMap.get(day.person_key).push({
        date: day.workforce_date,
        hours: day.work_hours,
        firstScan: formatHHMM(new Date(day.entry_time).getTime()),
        lastScan: day.exit_time ? formatHHMM(new Date(day.exit_time).getTime()) : null,
        hasOutScan: Boolean(day.exit_time),
        countedDay: day.work_hours_raw > 4,
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
        });
      }
      const row = subgroupMap.get(groupName);
      row.population += 1;
      row[person.hours_category] += 1;
      row[person.days_category] += 1;
      row.hours_sum += Number(person.total_hours) || 0;
      row.days_sum += Number(person.working_days) || 0;
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
      dayRule: "L_Mode/L_TID determines IN and OUT. Cross-midnight work is counted back to the original IN workforce date, even when the OUT scan is after 06:00 or in the next ISO week. Early arrivals before 06:00 are kept with the new day when they exit after 06:00. > 4 hours counts as 1 working day.",
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
