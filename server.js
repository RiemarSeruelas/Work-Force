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
const APP_PASSWORD = process.env.APP_PASSWORD || "Workforce2026";
const DAY_MS = 24 * 60 * 60 * 1000;

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
  return date.toLocaleTimeString("en-PH", {
    timeZone: MANILA_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
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

function isEntrance(row) {
  const tid = String(row.l_tid ?? "").trim();
  const mode = String(row.l_mode ?? "").toLowerCase();
  if (mode.includes("entrance")) return true;
  if (mode.includes("exit")) return false;
  return tid === "1";
}

function isExit(row) {
  const tid = String(row.l_tid ?? "").trim();
  const mode = String(row.l_mode ?? "").toLowerCase();
  if (mode.includes("exit")) return true;
  if (mode.includes("entrance")) return false;
  return tid === "0";
}

function splitIntervalSegments(startMs, endMs, hasOutScan) {
  const segments = [];
  let cursor = startMs;

  while (cursor < endMs) {
    const currentDate = getWorkforceDateManila(new Date(cursor));
    const calendarDate = formatDateOnly(getManilaDateParts(new Date(cursor)));
    const nextMidnight = startOfManilaDayMs(addDays(calendarDate, 1));
    const segmentEnd = Math.min(endMs, nextMidnight);
    const endsAtMidnight = segmentEnd === nextMidnight;

    segments.push({
      workforceDate: currentDate,
      calendarDate,
      firstScan: formatHHMM(cursor),
      lastScan: endsAtMidnight ? "24:00" : formatHHMM(segmentEnd),
      hasOutScan: hasOutScan || !endsAtMidnight,
      hours: Number(((segmentEnd - cursor) / 3600000).toFixed(2)),
    });

    cursor = segmentEnd;
  }

  return segments;
}

async function testDb() {
  await pool.query("SELECT 1");
}

async function queryScans(fromDate, toDate, group = "ALL") {
  const fromMs = windowStartMs(fromDate);
  const toMs = windowEndMs(toDate);
  const fromText = new Date(fromMs).toLocaleString("sv-SE", { timeZone: MANILA_TZ }).replace("T", " ");
  const toText = new Date(toMs).toLocaleString("sv-SE", { timeZone: MANILA_TZ }).replace("T", " ");

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
      AND ("C_Date"::date + "C_Time"::time) < $2::timestamp
      AND COALESCE(TRIM("Person"), '') <> ''
    ORDER BY "Person" ASC, ("C_Date"::date + "C_Time"::time) ASC
    `,
    [fromText, toText]
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
          }
        : null;
    })
    .filter(Boolean)
    .filter((row) => groupAllowed(row.persongroup, group));
}

function computeDailyRecords(scans, fromDate, toDate, now = new Date()) {
  const nowMs = now.getTime();
  const byDatePerson = new Map();

  for (let date = fromDate; date <= toDate; date = addDays(date, 1)) {
    const start = windowStartMs(date);
    const end = windowEndMs(date);
    const dayScans = scans.filter((scan) => scan.scan_ms >= start && scan.scan_ms < end);
    const people = new Map();

    for (const scan of dayScans) {
      if (!scan.person_key) continue;
      if (!people.has(scan.person_key)) {
        people.set(scan.person_key, {
          workforce_date: date,
          person_key: scan.person_key,
          l_uid: scan.l_uid,
          person: scan.person,
          persongroup: scan.persongroup,
          scans: [],
        });
      }
      const person = people.get(scan.person_key);
      person.scans.push(scan);
      if (scan.scan_ms >= (person.latest_actual_scan_ms || 0)) {
        person.l_uid = scan.l_uid;
        person.person = scan.person || person.person;
        person.persongroup = scan.persongroup || person.persongroup;
        person.latest_actual_scan_ms = scan.scan_ms;
      }
    }

    for (const person of people.values()) {
      person.scans.sort((a, b) => a.scan_ms - b.scan_ms);
      const intervals = [];
      let currentIn = null;

      for (const scan of person.scans) {
        if (isEntrance(scan)) {
          if (!currentIn) currentIn = scan;
          continue;
        }

        if (isExit(scan) && currentIn && scan.scan_ms > currentIn.scan_ms) {
          intervals.push({
            startMs: currentIn.scan_ms,
            endMs: scan.scan_ms,
            hasOutScan: true,
          });
          currentIn = null;
        }
      }

      if (currentIn) {
        const activeWindow = nowMs >= start && nowMs < end;
        const endMs = activeWindow && nowMs > currentIn.scan_ms ? nowMs : end;
        intervals.push({
          startMs: currentIn.scan_ms,
          endMs,
          hasOutScan: false,
        });
      }

      if (!intervals.length) continue;

      const workHoursRaw = intervals.reduce((sum, item) => sum + Math.max(item.endMs - item.startMs, 0) / 3600000, 0);
      const firstInterval = intervals[0];
      const lastInterval = intervals[intervals.length - 1];
      const segmentList = intervals.flatMap((item) => splitIntervalSegments(item.startMs, item.endMs, item.hasOutScan));

      byDatePerson.set(`${date}|${person.person_key}`, {
        workforce_date: date,
        person_key: person.person_key,
        l_uid: person.l_uid,
        person: person.person,
        persongroup: person.persongroup || "Unknown",
        workforce_group: isContractor(person.persongroup) ? "CONTRACTOR" : "FTE",
        entry_time: new Date(firstInterval.startMs).toISOString(),
        last_scan: new Date(person.latest_actual_scan_ms || lastInterval.endMs).toISOString(),
        exit_time: lastInterval.hasOutScan ? new Date(lastInterval.endMs).toISOString() : null,
        scan_count: person.scans.length,
        has_out_scan: intervals.some((item) => item.hasOutScan),
        work_hours_raw: workHoursRaw,
        work_hours: Number(workHoursRaw.toFixed(2)),
        hours_bucket: workHoursRaw >= 12 ? "hours_12_plus" : workHoursRaw > 10 ? "hours_10_12" : workHoursRaw > 8 ? "hours_8_10" : "hours_8_or_less",
        counted_day: workHoursRaw > 4,
        segments: segmentList,
      });
    }
  }

  return [...byDatePerson.values()];
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
  const { passcode } = req.body || {};
  if (passcode !== APP_PASSWORD) {
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

    const scans = await queryScans(startDate, workforceDate, group);
    const daily = computeDailyRecords(scans, startDate, workforceDate);
    const selectedDaily = daily.filter((row) => row.workforce_date === workforceDate);
    const latestScanMs = scans.reduce((max, scan) => Math.max(max, scan.scan_ms || 0), 0);

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
      dayRule: "Entrance events start work time. Exit events close work time. More than 4 hours counts as 1 working day.",
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

    const scans = await queryScans(workforceDate, workforceDate, group);
    let rows = computeDailyRecords(scans, workforceDate, workforceDate);

    if (search) {
      rows = rows.filter((row) =>
        String(row.person || "").toLowerCase().includes(search) ||
        String(row.persongroup || "").toLowerCase().includes(search)
      );
    }

    rows.sort((a, b) => String(a.person || "").localeCompare(String(b.person || "")));
    const total = rows.length;
    const pagedRows = rows.slice(offset, offset + limit);

    res.json({
      workforceDate,
      group,
      rows: pagedRows,
      total,
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
    const { startDate, endDate } = getWeekDateRangeManila(year, week);

    const scans = await queryScans(startDate, endDate, group);
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
        segments: day.segments || [],
      });
    }

    const people = [...personMap.values()].map((person) => {
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
    });

    const subgroupMap = new Map();
    for (const person of people) {
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

    res.json({
      year,
      week,
      group,
      startDate,
      endDate,
      dayRule: "Entrance starts time. Exit closes time. > 4 hours counts as 1 working day.",
      totals,
      rows,
      people: people.sort((a, b) => (Number(b.total_hours) || 0) - (Number(a.total_hours) || 0)),
    });
  } catch (err) {
    console.error("❌ WORKFORCE COMPLIANCE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/population", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const scans = await queryScans(workforceDate, workforceDate, "ALL");
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
