import express from "express";
import cors from "cors";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
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
  const manila = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  return manila;
}

function getWorkforceDateManila() {
  const manila = getManilaDateParts();
  if (manila.getHours() < 6) manila.setDate(manila.getDate() - 1);
  return formatDateOnly(manila);
}

function formatDateOnly(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getWeekDateRangeManila(year, weekNo) {
  const first = new Date(Number(year), 0, 1);
  const day = first.getDay() || 7;
  const monday = new Date(first);
  monday.setDate(first.getDate() + (1 - day) + (Number(weekNo) - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { startDate: formatDateOnly(monday), endDate: formatDateOnly(sunday) };
}

function parsePaging(req) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
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
        COUNT(*) FILTER (WHERE work_hours > 8)::int AS greater_than_8_hours,
        COUNT(*) FILTER (WHERE work_hours > 10)::int AS greater_than_10_hours,
        ROUND(AVG(work_hours)::numeric, 2) AS avg_work_hours,
        COALESCE(MAX(last_scan), NOW() AT TIME ZONE 'Asia/Manila') AS latest_scan
      FROM computed
      `,
      [workforceDate]
    );

    const row = result.rows[0] || {};
    res.json({
      workforceDate,
      group,
      totalPeople: Number(row.total_people) || 0,
      greaterThan8Hours: Number(row.greater_than_8_hours) || 0,
      greaterThan10Hours: Number(row.greater_than_10_hours) || 0,
      avgWorkHours: Number(row.avg_work_hours) || 0,
      latestScan: row.latest_scan,
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
          MIN(scan_ts) AS entry_time,
          MAX(scan_ts) AS last_scan,
          ROUND(GREATEST(EXTRACT(EPOCH FROM (MAX(scan_ts) - MIN(scan_ts))) / 3600.0, 0)::numeric, 2) AS work_hours,
          COUNT(*) AS scan_count
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
    const year = Number(req.query.year || getManilaDateParts().getFullYear());
    const week = Number(req.query.week || 1);
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
      daily AS (
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
        persongroup,
        COUNT(*)::int AS population,
        COUNT(*) FILTER (WHERE total_hours > 60)::int AS greater_than_60_hours,
        COUNT(*) FILTER (WHERE total_hours BETWEEN 51 AND 60)::int AS hours_51_60,
        COUNT(*) FILTER (WHERE total_hours BETWEEN 41 AND 50)::int AS hours_41_50,
        COUNT(*) FILTER (WHERE total_hours < 40)::int AS less_than_40_hours,
        COUNT(*) FILTER (WHERE working_days > 6)::int AS greater_than_6_days,
        COUNT(*) FILTER (WHERE working_days = 6)::int AS days_6,
        COUNT(*) FILTER (WHERE working_days = 5)::int AS days_5,
        ROUND(AVG(total_hours)::numeric, 2) AS avg_hours,
        ROUND(AVG(working_days)::numeric, 2) AS avg_days
      FROM person_week
      GROUP BY persongroup
      ORDER BY population DESC, persongroup ASC
      `,
      [startDate, endDate]
    );

    const totals = result.rows.reduce(
      (acc, row) => {
        acc.population += Number(row.population) || 0;
        acc.greaterThan60Hours += Number(row.greater_than_60_hours) || 0;
        acc.nonCompliantWorkingDays += Number(row.greater_than_6_days) || 0;
        return acc;
      },
      { population: 0, greaterThan60Hours: 0, nonCompliantWorkingDays: 0 }
    );

    res.json({ year, week, group, startDate, endDate, totals, rows: result.rows });
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
      WITH day_people AS (
        SELECT DISTINCT
          COALESCE(NULLIF(TRIM("L_UID"), ''), LOWER(TRIM("Person"))) AS person_key,
          "PersonGroup"
        FROM "hkvision"."tbhikvision"
        WHERE ("C_Date"::date + "C_Time"::time) >= ($1::date + TIME '06:00:00')
          AND ("C_Date"::date + "C_Time"::time) < (($1::date + INTERVAL '1 day') + TIME '06:00:00')
          AND COALESCE(TRIM("Person"), '') <> ''
      )
      SELECT
        COALESCE("PersonGroup", 'Unknown') AS persongroup,
        COUNT(*)::int AS population
      FROM day_people
      GROUP BY COALESCE("PersonGroup", 'Unknown')
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
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = Number(process.env.PORT) || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Workforce backend running on http://localhost:${PORT}`);
});
