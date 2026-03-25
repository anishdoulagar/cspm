import { useState, useEffect } from "react";
import AuthPage      from "./pages/AuthPage";
import SetupPage     from "./pages/SetupPage";
import DashboardPage from "./pages/DashboardPage";
import ConnectPage   from "./pages/ConnectPage";
import AccountsPage  from "./pages/AccountsPage";
import ScanPage      from "./pages/ScanPage";
import ResultsPage   from "./pages/ResultsPage";
import HistoryPage   from "./pages/HistoryPage";
import PoliciesPage  from "./pages/PoliciesPage";
import AlertsPage    from "./pages/AlertsPage";
import UsersPage     from "./pages/UsersPage";
import AuditPage     from "./pages/AuditPage";

const IconDashboard = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
  </svg>
);

const IconAccounts = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const IconScan = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const IconHistory = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 0 .5-4" /><polyline points="3 3 3 7 7 7" />
  </svg>
);

const IconPolicies = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconBell = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
    <circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const NAV_ITEMS = [
  { id: "dashboard", label: "DASHBOARD",  Icon: IconDashboard },
  { id: "accounts",  label: "ACCOUNTS",   Icon: IconAccounts  },
  { id: "connect",   label: "QUICK SCAN", Icon: IconScan      },
  { id: "history",   label: "HISTORY",    Icon: IconHistory   },
  { id: "alerts",    label: "ALERTS",     Icon: IconBell      },
  { id: "policies",  label: "POLICIES",   Icon: IconPolicies  },
];

const IconAudit = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    <polyline points="10 9 9 9 8 9" />
  </svg>
);

// Extra nav items only visible to admin+
const ADMIN_NAV_ITEMS = [
  { id: "users", label: "USERS",     Icon: IconUsers,  minRole: "superadmin" },
  { id: "audit", label: "AUDIT LOG", Icon: IconAudit,  minRole: "admin"      },
];

// ── Session persistence helpers ───────────────────────────────────────────────
function loadSession() {
  try {
    const t = sessionStorage.getItem("cspm_token");
    const u = sessionStorage.getItem("cspm_user");
    if (t && u) return { token: t, user: JSON.parse(u) };
  } catch {}
  return null;
}
function saveSession(token, user) {
  try {
    sessionStorage.setItem("cspm_token", token);
    sessionStorage.setItem("cspm_user", JSON.stringify(user));
  } catch {}
}
function clearSession() {
  try {
    sessionStorage.removeItem("cspm_token");
    sessionStorage.removeItem("cspm_user");
  } catch {}
}

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Read ?reset_token= or ?invite_token= from URL on initial load
function getResetTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("reset_token") || null;
  } catch { return null; }
}
function getInviteTokenFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("invite_token") || null;
  } catch { return null; }
}

export default function App() {
  const saved = loadSession();
  const [token, setToken] = useState(saved?.token || null);
  const [user,  setUser]  = useState(saved?.user  || null);
  const [initialResetToken]  = useState(getResetTokenFromUrl);
  const [initialInviteToken] = useState(getInviteTokenFromUrl);

  // null = checking, true = needs setup, false = has users
  const [needsSetup, setNeedsSetup] = useState(null);

  useEffect(() => {
    fetch(`${API}/auth/setup-status`)
      .then(r => r.json())
      .then(d => setNeedsSetup(d.needs_setup === true))
      .catch(() => setNeedsSetup(false)); // if backend unreachable, fall through to normal auth
  }, []);

  const [theme, setTheme] = useState(() => localStorage.getItem("cspm_theme") || "dark");
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cspm_theme", theme);
  }, [theme]);

  const [page,           setPage]           = useState("dashboard");
  const [scanResult,     setScanResult]     = useState(null);
  const [scanPayload,    setScanPayload]    = useState(null);
  const [dashboardData,  setDashboardData]  = useState(null);  // persists across navigation

  const [savedCloud, setSavedCloud] = useState("aws");
  const [savedAws,   setSavedAws]   = useState({
    access_key_id: "", secret_access_key: "", region: "us-east-1",
  });
  const [savedAzure, setSavedAzure] = useState({
    subscription_id: "", tenant_id: "", client_id: "", client_secret: "",
  });

  function handleAuth(newToken, newUser) {
    setToken(newToken);
    setUser(newUser);
    saveSession(newToken, newUser);
    setPage("dashboard");
  }

  function handleLogout() {
    clearSession();
    setToken(null); setUser(null); setDashboardData(null);
    setPage("dashboard"); setScanResult(null); setScanPayload(null);
  }

  function goToScan(payload) {
    setSavedCloud(payload.cloud);
    if (payload.aws)   setSavedAws(payload.aws);
    if (payload.azure) setSavedAzure(payload.azure);
    setScanPayload(payload);
    setPage("scan");
  }

  function onScanComplete(result) {
    setScanResult(result);
    setPage("results");
  }

  // Still checking setup status — show minimal loading screen
  if (needsSetup === null) return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--bg)", color: "var(--cyan)",
      fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.2em",
      textShadow: "var(--glow-cyan)",
      animation: "neonPulse 1.5s ease-in-out infinite",
    }}>
      INITIALIZING VANGUARD...
    </div>
  );

  // First run — no users exist
  if (needsSetup) return (
    <SetupPage onSetupComplete={(t, u) => { setNeedsSetup(false); handleAuth(t, u); }} />
  );

  // Not logged in
  if (!token || !user) return (
    <AuthPage onAuth={handleAuth} initialResetToken={initialResetToken} initialInviteToken={initialInviteToken} />
  );

  function renderPage() {
    switch (page) {
      case "accounts":
        return <AccountsPage token={token} role={user.role} onScanComplete={onScanComplete} />;
      case "connect":
        return (
          <ConnectPage
            onStartScan={goToScan}
            savedCloud={savedCloud}
            savedAws={savedAws}
            savedAzure={savedAzure}
            onCredsChange={(cloud, aws, azure) => {
              setSavedCloud(cloud);
              if (aws)   setSavedAws(aws);
              if (azure) setSavedAzure(azure);
            }}
          />
        );
      case "scan":
        return <ScanPage cloud={scanPayload} onComplete={onScanComplete} />;
      case "results":
        return (
          <ResultsPage
            result={scanResult}
            onNewScan={() => setPage("dashboard")}
          />
        );
      case "history":
        return <HistoryPage token={token} role={user.role} />;
      case "alerts":
        return <AlertsPage token={token} role={user.role} userEmail={user.email} />;
      case "policies":
        return <PoliciesPage role={user.role} />;
      case "users":
        return <UsersPage token={token} currentUser={user} />;
      case "audit":
        return <AuditPage token={token} />;
      default:
        return null;
    }
  }

  const activePage = ["results","scan"].includes(page) ? "dashboard" : page;


  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"var(--bg)" }}>

      {/* ── Sidebar ── */}
      <nav style={{
        width:"190px", flexShrink:0,
        background:"var(--surface)", borderRight:"1px solid var(--sidebar-border)",
        display:"flex", flexDirection:"column",
        padding:"24px 0", position:"sticky", top:0, height:"100vh",
      }}>
        <div style={{ padding:"0 20px 24px" }}>
          <div style={{
            fontFamily:"var(--font-display)", fontWeight:900,
            fontSize:"18px", letterSpacing:"0.12em", lineHeight:1,
            color:"var(--cyan)",
            textShadow:"var(--glow-cyan)",
          }}>VANGUARD</div>
          <div style={{
            fontFamily:"var(--font-mono)", fontSize:"9px",
            color:"var(--accent3)", marginTop:"4px",
            letterSpacing:"0.2em",
          }}>// CSPM v1.0</div>
        </div>

        <div style={{ height:"1px", background:"var(--nav-divider)", marginBottom:"8px" }} />

        {NAV_ITEMS.filter(item =>
          !(user.role === "viewer" && item.id === "connect")
        ).map(({ id, label, Icon }) => {
          const active = activePage === id;
          return (
            <button key={id} onClick={() => setPage(id)}
              className={`nav-btn${active ? " active" : ""}`}
              style={{
                display:"flex", alignItems:"center", gap:"10px",
                padding:"11px 20px", border:"none",
                background: active ? "var(--nav-active-bg)" : "transparent",
                color:      active ? "var(--cyan)" : "var(--accent2)",
                fontFamily:"var(--font-ui)", fontWeight: active ? 700 : 500,
                fontSize:"12px", letterSpacing:"0.08em",
                cursor:"pointer", textAlign:"left", width:"100%",
                borderLeft: "none",
                textShadow: active ? `0 0 8px var(--nav-active-glow)` : "none",
              }}>
              <Icon />{label}
            </button>
          );
        })}

        {/* Admin section */}
        {(user.role === "superadmin" || user.role === "admin") && (
          <>
            <div style={{
              margin:"12px 20px 4px",
              display:"flex", alignItems:"center", gap:6,
            }}>
              <div style={{ flex:1, height:"1px", background:"var(--nav-divider)" }} />
              <span style={{
                fontFamily:"var(--font-ui)", fontSize:"9px", fontWeight:700,
                color:"var(--magenta)", letterSpacing:"0.12em",
              }}>ADMIN</span>
              <div style={{ flex:1, height:"1px", background:"var(--nav-divider)" }} />
            </div>
            {ADMIN_NAV_ITEMS.filter(item =>
              item.minRole === "admin" || user.role === "superadmin"
            ).map(({ id, label, Icon }) => {
              const active = activePage === id;
              return (
                <button key={id} onClick={() => setPage(id)} style={{
                  display:"flex", alignItems:"center", gap:"10px",
                  padding:"11px 20px", border:"none",
                  background: active ? "var(--admin-active-bg)" : "transparent",
                  color:      active ? "var(--magenta)" : "var(--accent2)",
                  fontFamily:"var(--font-ui)", fontWeight: active ? 700 : 500,
                  fontSize:"12px", letterSpacing:"0.08em",
                  cursor:"pointer", textAlign:"left", width:"100%",
                  borderLeft: "none",
                  textShadow: active ? `0 0 8px var(--admin-active-glow)` : "none",
                  transition:"all 0.15s",
                }}>
                  <Icon />{label}
                </button>
              );
            })}
          </>
        )}

        {/* User + Logout */}
        <div style={{ marginTop:"auto" }}>
          <div style={{ height:"1px", background:"var(--nav-divider)", marginBottom:"12px" }} />
          <div style={{ padding:"0 20px 8px" }}>
            <div style={{ color:"var(--accent)", fontSize:"12px",
                          fontFamily:"var(--font-ui)", fontWeight:600,
                          overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap" }}>{user.name}</div>
            <div style={{ color:"var(--accent3)", fontSize:"11px",
                          fontFamily:"var(--font-mono)", marginTop:"2px",
                          overflow:"hidden", textOverflow:"ellipsis",
                          whiteSpace:"nowrap" }}>{user.email}</div>
            {user.role && (() => {
              const roleColors = {
                viewer:     { bg:"rgba(57,255,20,0.08)",  border:"rgba(57,255,20,0.3)",   text:"var(--green)" },
                analyst:    { bg:"rgba(0,207,255,0.08)",  border:"rgba(0,207,255,0.3)",   text:"var(--blue)" },
                admin:      { bg:"var(--role-admin-bg)",  border:"var(--role-admin-border)", text:"var(--cyan)" },
                superadmin: { bg:"var(--role-super-bg)",  border:"var(--role-super-border)", text:"var(--magenta)" },
              };
              const c = roleColors[user.role] || roleColors.analyst;
              return (
                <div style={{ marginTop:"4px", display:"inline-block",
                  background:c.bg, border:`1px solid ${c.border}`,
                  color:c.text, fontSize:"9px", fontWeight:700,
                  padding:"1px 6px", borderRadius:"3px",
                  fontFamily:"var(--font-ui)", letterSpacing:"0.08em",
                  textTransform:"uppercase" }}>
                  {user.role}
                </div>
              );
            })()}
          </div>
          <button
            onClick={() => setTheme(t => t === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            style={{
              width:"100%", padding:"10px 20px",
              background:"transparent",
              border:"none", borderTop:"1px solid var(--bottom-divider)",
              color:"var(--accent3)", cursor:"pointer",
              fontFamily:"var(--font-ui)", fontSize:"12px",
              textAlign:"left", letterSpacing:"0.08em", transition:"color 0.15s",
              display:"flex", alignItems:"center", gap:8,
            }}
            onMouseEnter={e => e.currentTarget.style.color = "var(--cyan)"}
            onMouseLeave={e => e.currentTarget.style.color = "var(--accent3)"}>
            {theme === "dark" ? "☀" : "☾"} {theme === "dark" ? "LIGHT MODE" : "DARK MODE"}
          </button>
          <button onClick={handleLogout} className="neon-btn" style={{
            width:"100%", padding:"10px 20px",
            background:"transparent",
            border:"none", borderTop:"1px solid rgba(255,230,0,0.08)",
            color:"var(--accent3)", cursor:"pointer",
            fontFamily:"var(--font-ui)", fontSize:"12px",
            textAlign:"left", letterSpacing:"0.08em", transition:"color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "var(--magenta)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--accent3)"}>
            SIGN OUT
          </button>
        </div>
      </nav>

      <main style={{ flex:1, overflowY:"auto", minWidth:0, position:"relative" }}>
        {/* Dashboard is always mounted — never unmounts so it never loses state */}
        <div style={{ display: activePage === "dashboard" ? "block" : "none" }}>
          <DashboardPage
            token={token}
            role={user.role}
            onScanComplete={onScanComplete}
            onNavigate={setPage}
            isActive={activePage === "dashboard"}
          />
        </div>

        {/* All other pages render normally when active */}
        {activePage !== "dashboard" && renderPage()}
      </main>
    </div>
  );
}
