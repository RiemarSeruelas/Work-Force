import { create } from "zustand";

function getWorkforceDateManilaClient() {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  if (manila.getHours() < 6) manila.setDate(manila.getDate() - 1);

  const yyyy = manila.getFullYear();
  const mm = String(manila.getMonth() + 1).padStart(2, "0");
  const dd = String(manila.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentIsoWeekManilaClient() {
  const now = new Date();
  const manila = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Manila" }));
  manila.setHours(0, 0, 0, 0);
  manila.setDate(manila.getDate() + 3 - ((manila.getDay() + 6) % 7));

  const week1 = new Date(manila.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((manila - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );

  return {
    year: manila.getFullYear(),
    week,
  };
}

async function parseJsonResponse(res) {
  const text = await res.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

const currentWeek = getCurrentIsoWeekManilaClient();

export const useWorkforceStore = create((set, get) => ({
  theme: localStorage.getItem("workforce-theme") || "light",
  workforceDate: getWorkforceDateManilaClient(),
  selectedYear: currentWeek.year,
  selectedWeek: currentWeek.week,
  group: "ALL",
  search: "",

  summary: null,
  dailyRows: [],
  dailyTotal: 0,
  compliance: null,
  populationRows: [],
  loading: false,
  error: "",

  toggleTheme: () =>
    set((state) => {
      const nextTheme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("workforce-theme", nextTheme);
      return { theme: nextTheme };
    }),

  setWorkforceDate: (value) => set({ workforceDate: value }),
  setSelectedYear: (value) =>
    set({ selectedYear: Number(value) || getCurrentIsoWeekManilaClient().year }),
  setSelectedWeek: (value) =>
    set({ selectedWeek: Number(value) || getCurrentIsoWeekManilaClient().week }),
  setGroup: (value) => set({ group: value || "ALL" }),
  setSearch: (value) => set({ search: value || "" }),

  fetchSummary: async () => {
    set({ loading: true, error: "" });
    try {
      const { workforceDate, group } = get();
      const params = new URLSearchParams({
        date: workforceDate,
        group,
        _t: String(Date.now()),
      });
      const res = await fetch(`/api/workforce/summary?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await parseJsonResponse(res);
      set({ summary: data, loading: false });
    } catch (err) {
      set({ error: err.message, loading: false });
    }
  },

  fetchDailyRecord: async () => {
    set({ loading: true, error: "" });
    try {
      const { workforceDate, search, group } = get();
      const params = new URLSearchParams({
        date: workforceDate,
        search,
        group,
        limit: "5000",
        offset: "0",
        _t: String(Date.now()),
      });
      const res = await fetch(`/api/workforce/daily-record?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await parseJsonResponse(res);
      set({
        dailyRows: data.rows || [],
        dailyTotal: Number(data.total) || 0,
        loading: false,
      });
    } catch (err) {
      set({ error: err.message, dailyRows: [], dailyTotal: 0, loading: false });
    }
  },

  fetchCompliance: async (forcedGroup) => {
    set({ loading: true, error: "" });
    try {
      const { selectedYear, selectedWeek, group } = get();
      const params = new URLSearchParams({
        year: String(selectedYear),
        week: String(selectedWeek),
        group: forcedGroup || group,
        _t: String(Date.now()),
      });
      const res = await fetch(`/api/workforce/compliance?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await parseJsonResponse(res);
      set({ compliance: data, loading: false });
    } catch (err) {
      set({ error: err.message, compliance: null, loading: false });
    }
  },

  fetchPopulation: async () => {
    set({ loading: true, error: "" });
    try {
      const { workforceDate } = get();
      const params = new URLSearchParams({
        date: workforceDate,
        _t: String(Date.now()),
      });
      const res = await fetch(`/api/workforce/population?${params.toString()}`, {
        cache: "no-store",
      });
      const data = await parseJsonResponse(res);
      set({ populationRows: data.rows || [], loading: false });
    } catch (err) {
      set({ error: err.message, populationRows: [], loading: false });
    }
  },
}));
