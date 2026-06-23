import { Link, useLocation } from "react-router-dom";
import { useWorkforceStore } from "../store/useWorkforceStore.js";


const navItems = [
  { label: "Overview", path: "/workforce" },
  { label: "Daily Record", path: "/workforce/daily-record" },
  { label: "Compliance", path: "/workforce/compliance" },
  { label: "Population", path: "/workforce/population" },
  { label: "Map", path: "/workforce/map" },
];

export default function AppShell({
  title,
  subtitle,
  summaryStats = [],
  summaryControls = null,
  children,
}) {
  const location = useLocation();
  const theme = useWorkforceStore((s) => s.theme);
  const toggleTheme = useWorkforceStore((s) => s.toggleTheme);
  const isBusy = useWorkforceStore(
    (s) =>
      s.loading ||
      s.dailyLoadingMore ||
      s.compliancePeopleLoading ||
      s.compliancePeopleLoadingMore
  );

  const logout = () => {
    sessionStorage.removeItem("appAccess");
    window.location.href = "/passcode";
  };

  return (
    <div className="app-shell" data-theme={theme} data-busy={isBusy ? "true" : "false"}>
      <header className="topbar">
        <div className="brand-card">
          <div className="brand-icon">CF</div>
          <div className="brand-copy">
            <div className="brand-title">Cavite Foods Workforce</div>
          </div>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <nav className="topbar-nav" aria-label="Workforce dashboard navigation">
            {navItems.map((item) => (
              <Link key={item.path} to={item.path} className="top-nav-link">
                <button
                  className={`top-nav-btn ${
                    location.pathname === item.path ? "active" : ""
                  }`}
                >
                  {item.label}
                </button>
              </Link>
            ))}
          </nav>
          <button className="top-nav-btn utility-btn" onClick={toggleTheme}>
            {theme === "dark" ? "☀ Light" : "🌙 Dark"}
          </button>
          <button className="top-nav-btn utility-btn logout-btn" onClick={logout}>
            Logout
          </button>
        </div>
      </header>

      <section className="summary-strip">
        <div className="summary-copy">
          <div className="summary-title">{title}</div>
          {subtitle && <div className="summary-subtitle">{subtitle}</div>}
        </div>

        <div className="summary-right">
          {summaryStats.length > 0 && (
            <div className="summary-stats">
              {summaryStats.map((stat, index) => (
                <div className={`summary-stat ${stat.variant || ""}`} key={`${stat.label}-${index}`}>
                  <div className="summary-value">{stat.value}</div>
                  <div className="summary-label">{stat.label}</div>
                </div>
              ))}
            </div>
          )}

          {summaryControls && (
            <div className="summary-controls" aria-label="Page filters">
              {summaryControls}
            </div>
          )}
        </div>
      </section>

      <main className="workspace workforce-workspace">{children}</main>
    </div>
  );
}
