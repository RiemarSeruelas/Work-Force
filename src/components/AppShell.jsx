import { Link, useLocation } from "react-router-dom";
import { useWorkforceStore } from "../store/useWorkforceStore.js";

const navItems = [
  { label: "Dashboard", path: "/workforce" },
  { label: "Daily Record", path: "/workforce/daily-record" },
  { label: "Daily Compliance", path: "/workforce/compliance" },
  { label: "FTE", path: "/workforce/fte-compliance" },
  { label: "Contractor", path: "/workforce/contractor-compliance" },
  { label: "Population", path: "/workforce/population" },
];

export default function AppShell({ title, subtitle, summaryStats = [], children }) {
  const location = useLocation();
  const theme = useWorkforceStore((s) => s.theme);
  const toggleTheme = useWorkforceStore((s) => s.toggleTheme);

  const logout = () => {
    sessionStorage.removeItem("appAccess");
    window.location.href = "/passcode";
  };

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-card">
          <div className="brand-icon">CF</div>
          <div className="brand-copy">
            <div className="brand-title">Cavite Foods Workforce</div>
            <div className="brand-subtitle">Monitoring dashboard · 6:00 AM to 5:59 AM</div>
          </div>
        </div>

        <div className="topbar-actions">
          <button className="top-nav-btn" onClick={toggleTheme}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
          <button className="top-nav-btn logout-btn" onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="second-nav" aria-label="Workforce dashboard navigation">
        {navItems.map((item) => (
          <Link key={item.path} to={item.path} className="top-nav-link">
            <button className={`second-nav-btn ${location.pathname === item.path ? "active" : ""}`}>
              {item.label}
            </button>
          </Link>
        ))}
      </nav>

      <section className="summary-strip">
        <div className="summary-copy">
          <div className="summary-eyebrow">Workforce Monitoring</div>
          <div className="summary-title">{title}</div>
          <div className="summary-subtitle">{subtitle}</div>
        </div>

        <div className="summary-stats">
          {summaryStats.map((stat, index) => (
            <div className={`summary-stat ${stat.variant || ""}`} key={`${stat.label}-${index}`}>
              <div className="summary-value">{stat.value}</div>
              <div className="summary-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <main className="workspace workforce-workspace">{children}</main>
    </div>
  );
}
