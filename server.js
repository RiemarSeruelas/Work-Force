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

function getManilaDateParts(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
}

function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getWorkforceDateManila() {
  const manila = getManilaDateParts();
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
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 10000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  return { limit, offset };
}

function groupFilterSql(groupValue) {
  const group = String(groupValue || "ALL").toUpperCase();
  if (group === "FTE") {
    return `AND LOWER(COALESCE("PersonGroup", '')) NOT LIKE '%contract%'`;
  }
  if (group === "CONTRACTOR") {
    return `AND LOWER(COALESCE("PersonGroup", '')) LIKE '%contract%'`;
  }
  return "";
}

async function testDb() {
  await pool.query("SELECT 1");
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
  if (!process.env.APP_PASSWORD) {
    return res.status(500).json({ error: "APP_PASSWORD is not configured" });
  }
  if (passcode !== process.env.APP_PASSWORD) {
    return res.status(401).json({ error: "Invalid passcode" });
  }
  res.json({ success: true, token: "passcode-ok" });
});

app.get("/api/workforce/summary", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const group = String(req.query.group || "ALL");
    const periodRaw = String(req.query.period || "DAILY").toUpperCase();
    const period = ["DAILY", "WEEKLY", "MONTHLY"].includes(periodRaw)
      ? periodRaw
      : "DAILY";
    const groupSql = groupFilterSql(group);

    const result = await pool.query(
      `
      WITH day_scans AS (
        SELECT
          "L_UID",
          "Person",
          "PersonGroup",
          "L_Mode",
          "L_TID",
          "C_Date",
          "C_Time",
          ("C_Date"::date + "C_Time"::time) AS scan_ts
        FROM "hkvision"."tbhikvision"
        WHERE ("C_Date"::date + "C_Time"::time) >= ($1::date + TIME '06:00:00')
          AND ("C_Date"::date + "C_Time"::time) < (($1::date + INTERVAL '1 day') + TIME '06:00:00')
          AND COALESCE(TRIM("Person"), '') <> ''
          ${groupSql}
      ),
      first_last AS (
        SELECT
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          MAX("Person") AS person,
          MAX("PersonGroup") AS persongroup,
          MIN(scan_ts) AS first_scan,
          MAX(scan_ts) AS last_scan,
          COUNT(*) AS scan_count
        FROM day_scans
        GROUP BY COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person")))
      ),
      computed AS (
        SELECT
          *,
          GREATEST(EXTRACT(EPOCH FROM (last_scan - first_scan)) / 3600.0, 0) AS work_hours
        FROM first_last
      )
      SELECT
        COUNT(*)::int AS total_people,
        COUNT(*) FILTER (WHERE work_hours > 4)::int AS counted_days,
        COUNT(*) FILTER (WHERE work_hours > 8 AND work_hours <= 10)::int AS greater_than_8_hours,
        COUNT(*) FILTER (WHERE work_hours > 10 AND work_hours < 12)::int AS greater_than_10_hours,
        COUNT(*) FILTER (WHERE work_hours >= 12)::int AS greater_than_12_hours,
        COALESCE(MAX(last_scan), NOW() AT TIME ZONE 'Asia/Manila') AS latest_scan
      FROM computed
      `,
      [workforceDate]
    );

    const trendResult = await pool.query(
      `
      WITH bounds AS (
        SELECT
          CASE
            WHEN $2::text = 'MONTHLY' THEN date_trunc('month', $1::date)::date - INTERVAL '5 months'
            WHEN $2::text = 'WEEKLY' THEN date_trunc('week', $1::date)::date - INTERVAL '7 weeks'
            ELSE $1::date - INTERVAL '13 days'
          END AS start_date,
          $1::date AS end_date
      ),
      scans AS (
        SELECT
          CASE
            WHEN EXTRACT(HOUR FROM h."C_Time"::time) < 6
              THEN (h."C_Date"::date - INTERVAL '1 day')::date
            ELSE h."C_Date"::date
          END AS workforce_date,
          h."L_UID",
          h."Person",
          h."PersonGroup",
          (h."C_Date"::date + h."C_Time"::time) AS scan_ts
        FROM "hkvision"."tbhikvision" h
        CROSS JOIN bounds b
        WHERE (h."C_Date"::date + h."C_Time"::time) >= (b.start_date::date + TIME '06:00:00')
          AND (h."C_Date"::date + h."C_Time"::time) < ((b.end_date::date + INTERVAL '1 day') + TIME '06:00:00')
          AND COALESCE(TRIM(h."Person"), '') <> ''
          ${groupSql.replaceAll('"PersonGroup"', 'h."PersonGroup"')}
      ),
      daily AS (
        SELECT
          workforce_date,
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) AS work_hours,
          CASE
            WHEN GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) > 4
              THEN 1
            ELSE 0
          END AS counted_day
        FROM scans
        GROUP BY workforce_date, COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person")))
      ),
      period_person AS (
        SELECT
          CASE
            WHEN $2::text = 'MONTHLY' THEN date_trunc('month', workforce_date)::date
            WHEN $2::text = 'WEEKLY' THEN date_trunc('week', workforce_date)::date
            ELSE workforce_date
          END AS period_start,
          person_key,
          SUM(work_hours) AS total_hours,
          SUM(counted_day)::int AS working_days
        FROM daily
        GROUP BY
          CASE
            WHEN $2::text = 'MONTHLY' THEN date_trunc('month', workforce_date)::date
            WHEN $2::text = 'WEEKLY' THEN date_trunc('week', workforce_date)::date
            ELSE workforce_date
          END,
          person_key
      )
      SELECT
        period_start::text AS period_start,
        COUNT(*)::int AS population,
        COUNT(*) FILTER (WHERE total_hours <= 8)::int AS hours_8_or_less,
        COUNT(*) FILTER (WHERE total_hours > 8 AND total_hours <= 10)::int AS hours_8_10,
        COUNT(*) FILTER (WHERE total_hours > 10 AND total_hours < 12)::int AS hours_10_12,
        COUNT(*) FILTER (WHERE total_hours >= 12)::int AS hours_12_plus,
        COUNT(*) FILTER (WHERE working_days > 0 AND working_days <= 5)::int AS days_5_or_less,
        COUNT(*) FILTER (WHERE working_days = 6)::int AS days_6,
        COUNT(*) FILTER (WHERE working_days > 6)::int AS days_over_6,
        ROUND(AVG(total_hours)::numeric, 2) AS average_hours,
        ROUND(AVG(NULLIF(working_days, 0))::numeric, 2) AS average_days
      FROM period_person
      GROUP BY period_start
      ORDER BY period_start ASC
      `,
      [workforceDate, period]
    );

    const row = result.rows[0] || {};
    res.json({
      workforceDate,
      group,
      period,
      totalPeople: Number(row.total_people) || 0,
      countedDays: Number(row.counted_days) || 0,
      greaterThan8Hours: Number(row.greater_than_8_hours) || 0,
      greaterThan10Hours: Number(row.greater_than_10_hours) || 0,
      greaterThan12Hours: Number(row.greater_than_12_hours) || 0,
      latestScan: row.latest_scan,
      timeSeries: trendResult.rows || [],
      dayRule: "Entering counts toward workforce population. More than 4 hours counts as 1 working day.",
    });
  } catch (err) {
    console.error("❌ WORKFORCE SUMMARY ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/daily-record", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const search = String(req.query.search || "").trim();
    const group = String(req.query.group || "ALL");
    const { limit, offset } = parsePaging(req);
    const groupSql = groupFilterSql(group);

    const result = await pool.query(
      `
      WITH day_scans AS (
        SELECT
          "L_UID",
          "Person",
          "PersonGroup",
          "L_Mode",
          "L_TID",
          "C_Date",
          "C_Time",
          ("C_Date"::date + "C_Time"::time) AS scan_ts
        FROM "hkvision"."tbhikvision"
        WHERE ("C_Date"::date + "C_Time"::time) >= ($1::date + TIME '06:00:00')
          AND ("C_Date"::date + "C_Time"::time) < (($1::date + INTERVAL '1 day') + TIME '06:00:00')
          AND COALESCE(TRIM("Person"), '') <> ''
          ${groupSql}
      ),
      grouped AS (
        SELECT
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          MAX("L_UID") AS l_uid,
          MAX("Person") AS person,
          MAX("PersonGroup") AS persongroup,
          CASE
            WHEN LOWER(COALESCE(MAX("PersonGroup"), '')) LIKE '%contract%' THEN 'CONTRACTOR'
            ELSE 'FTE'
          END AS workforce_group,
          MIN(scan_ts) AS entry_time,
          MAX(scan_ts) AS last_scan,
          GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) AS work_hours_raw,
          ROUND(GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0)::numeric, 2) AS work_hours,
          COUNT(*) AS scan_count,
          CASE
            WHEN GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) >= 12 THEN 'hours_12_plus'
            WHEN GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) > 10 THEN 'hours_10_12'
            WHEN GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) > 8 THEN 'hours_8_10'
            ELSE 'hours_8_or_less'
          END AS hours_bucket,
          CASE
            WHEN GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) > 4
              THEN TRUE
            ELSE FALSE
          END AS counted_day
        FROM day_scans
        GROUP BY COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person")))
      ),
      filtered AS (
        SELECT *, COUNT(*) OVER() AS total_count
        FROM grouped
        WHERE $2::text = ''
          OR LOWER(person) LIKE LOWER('%' || $2::text || '%')
          OR LOWER(persongroup) LIKE LOWER('%' || $2::text || '%')
      )
      SELECT *
      FROM filtered
      ORDER BY person ASC
      LIMIT $3 OFFSET $4
      `,
      [workforceDate, search, limit, offset]
    );

    const rows = result.rows;
    const total = rows.length ? Number(rows[0].total_count) || 0 : 0;
    res.json({
      workforceDate,
      group,
      rows: rows.map(({ total_count, ...row }) => row),
      total,
      limit,
      offset,
      hasMore: offset + rows.length < total,
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
    const groupSql = groupFilterSql(group);

    const result = await pool.query(
      `
      WITH scans AS (
        SELECT
          "L_UID",
          "Person",
          "PersonGroup",
          ("C_Date"::date + "C_Time"::time) AS scan_ts,
          CASE
            WHEN EXTRACT(HOUR FROM ("C_Time"::time)) < 6
              THEN ("C_Date"::date - INTERVAL '1 day')::date
            ELSE "C_Date"::date
          END AS workforce_date
        FROM "hkvision"."tbhikvision"
        WHERE "C_Date"::date >= $1::date
          AND "C_Date"::date <= ($2::date + INTERVAL '1 day')::date
          AND COALESCE(TRIM("Person"), '') <> ''
          ${groupSql}
      ),
      daily_raw AS (
        SELECT
          workforce_date,
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          MAX("Person") AS person,
          MAX("PersonGroup") AS persongroup,
          ROUND(GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0)::numeric, 2) AS work_hours
        FROM scans
        WHERE workforce_date >= $1::date AND workforce_date <= $2::date
        GROUP BY workforce_date, COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person")))
      ),
      daily AS (
        SELECT *
        FROM daily_raw
        WHERE work_hours > 4
      ),
      person_week AS (
        SELECT
          person_key,
          MAX(person) AS person,
          MAX(persongroup) AS persongroup,
          COUNT(DISTINCT workforce_date)::int AS working_days,
          ROUND(SUM(work_hours)::numeric, 2) AS total_hours
        FROM daily
        GROUP BY person_key
      ),
      subgroup AS (
        SELECT
          persongroup,
          COUNT(*)::int AS population,
          COUNT(*) FILTER (WHERE total_hours > 60)::int AS greater_than_60_hours,
          COUNT(*) FILTER (WHERE total_hours >= 40 AND total_hours <= 60)::int AS hours_40_60,
          COUNT(*) FILTER (WHERE total_hours < 40)::int AS less_than_40_hours,
          COUNT(*) FILTER (WHERE working_days > 6)::int AS greater_than_6_days,
          COUNT(*) FILTER (WHERE working_days >= 5 AND working_days <= 6)::int AS days_5_6,
          COUNT(*) FILTER (WHERE working_days < 5)::int AS days_less_than_5,
          ROUND(AVG(total_hours)::numeric, 2) AS avg_hours,
          ROUND(AVG(working_days)::numeric, 2) AS avg_days
        FROM person_week
        GROUP BY persongroup
      )
      SELECT *
      FROM subgroup
      ORDER BY population DESC, persongroup ASC
      `,
      [startDate, endDate]
    );

    const peopleResult = await pool.query(
      `
      WITH scans AS (
        SELECT
          "L_UID",
          "Person",
          "PersonGroup",
          ("C_Date"::date + "C_Time"::time) AS scan_ts,
          CASE
            WHEN EXTRACT(HOUR FROM ("C_Time"::time)) < 6
              THEN ("C_Date"::date - INTERVAL '1 day')::date
            ELSE "C_Date"::date
          END AS workforce_date
        FROM "hkvision"."tbhikvision"
        WHERE "C_Date"::date >= $1::date
          AND "C_Date"::date <= ($2::date + INTERVAL '1 day')::date
          AND COALESCE(TRIM("Person"), '') <> ''
          ${groupSql}
      ),
      daily_raw AS (
        SELECT
          workforce_date,
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          MAX("Person") AS person,
          MAX("PersonGroup") AS persongroup,
          ROUND(GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0)::numeric, 2) AS work_hours
        FROM scans
        WHERE workforce_date >= $1::date AND workforce_date <= $2::date
        GROUP BY workforce_date, COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person")))
      ),
      daily AS (
        SELECT *
        FROM daily_raw
        WHERE work_hours > 4
      ),
      person_week AS (
        SELECT
          person_key,
          MAX(person) AS person,
          MAX(persongroup) AS persongroup,
          COUNT(DISTINCT workforce_date)::int AS working_days,
          ROUND(SUM(work_hours)::numeric, 2) AS total_hours
        FROM daily
        GROUP BY person_key
      )
      SELECT
        person,
        persongroup,
        working_days,
        total_hours,
        CASE
          WHEN total_hours > 60 THEN 'greater_than_60_hours'
          WHEN total_hours >= 40 AND total_hours <= 60 THEN 'hours_40_60'
          ELSE 'less_than_40_hours'
        END AS hours_category,
        CASE
          WHEN working_days > 6 THEN 'greater_than_6_days'
          WHEN working_days >= 5 AND working_days <= 6 THEN 'days_5_6'
          ELSE 'days_less_than_5'
        END AS days_category
      FROM person_week
      ORDER BY total_hours DESC, working_days DESC, person ASC
      `,
      [startDate, endDate]
    );

    const totals = result.rows.reduce(
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
      dayRule: "> 4 hours counts as 1 working day",
      totals,
      rows: result.rows,
      people: peopleResult.rows || [],
    });
  } catch (err) {
    console.error("❌ WORKFORCE COMPLIANCE ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/workforce/population", async (req, res) => {
  try {
    const workforceDate = String(req.query.date || getWorkforceDateManila());
    const result = await pool.query(
      `
      WITH day_scans AS (
        SELECT
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          "PersonGroup",
          ("C_Date"::date + "C_Time"::time) AS scan_ts
        FROM "hkvision"."tbhikvision"
        WHERE ("C_Date"::date + "C_Time"::time) >= ($1::date + TIME '06:00:00')
          AND ("C_Date"::date + "C_Time"::time) < (($1::date + INTERVAL '1 day') + TIME '06:00:00')
          AND COALESCE(TRIM("Person"), '') <> ''
      ),
      grouped AS (
        SELECT
          person_key,
          MAX("PersonGroup") AS persongroup,
          GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0) AS work_hours
        FROM day_scans
        GROUP BY person_key
      )
      SELECT
        COALESCE(persongroup, 'Unknown') AS persongroup,
        COUNT(*)::int AS population
      FROM grouped
      GROUP BY COALESCE(persongroup, 'Unknown')
      ORDER BY population DESC, persongroup ASC
      `,
      [workforceDate]
    );
    res.json({ workforceDate, rows: result.rows });
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

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Workforce backend running on http://localhost:${PORT}`);
});
