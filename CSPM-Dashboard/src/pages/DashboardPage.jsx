import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
  LineChart, Line,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SEV_COLOR = {
  CRITICAL: "#ff2255",
  HIGH:     "#ff6b00",
  MEDIUM:   "#ffe600",
  LOW:      "#39ff14",
};

// Rule IDs format: AWS-S3-003, AWS-IAM-001, AZURE-STORAGE-001
function serviceLabel(ruleId = "") {
  const parts = ruleId.split("-");
  if (parts.length >= 2) {
    const svc = parts[1].toUpperCase();
    const aliases = {
      CFG: "Config", CT: "CloudTrail", GD: "GuardDuty",
      ELB: "Load Balancer", ALB: "Load Balancer", WAF: "WAF",
      SSM: "SSM", ECR: "ECR", ECS: "ECS",
    };
    return aliases[svc] || svc;
  }
  return ruleId || "OTHER";
}

function scoreColor(s) {
  if (s == null) return "var(--accent3)";
  if (s >= 80) return "#39ff14";
  if (s >= 60) return "#ffe600";
  if (s >= 40) return "#ff6b00";
  return "#ff2255";
}
function scoreLabel(s) {
  if (s == null) return "NO DATA";
  if (s >= 80) return "LOW RISK";
  if (s >= 60) return "MED RISK";
  if (s >= 40) return "HIGH RISK";
  return "CRITICAL";
}
function timeAgo(iso) {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function statusColor(s) {
  if (s === "resolved")     return "#39ff14";
  if (s === "acknowledged") return "#ffe600";
  return "#ff6b00";
}

// ── Shared card ───────────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div className="neon-card" style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "10px", overflow: "hidden", ...style,
    }}>
      {children}
    </div>
  );
}

function CardHeader({ title, right }) {
  return (
    <div style={{
      padding: "12px 18px", borderBottom: "1px solid var(--border)",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
    }}>
      <span style={{
        color: "var(--accent)", fontFamily: "var(--font-display)",
        fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em",
      }}>{title}</span>
      {right}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, bar, active, onClick }) {
  const hex = color?.startsWith("#") ? color : null;
  return (
    <div onClick={onClick} style={{
      background: active && hex ? `${hex}14` : "var(--card)",
      border: `1px solid ${active && hex ? hex : "var(--border)"}`,
      borderRadius: "10px", padding: "16px 18px",
      cursor: onClick ? "pointer" : "default",
      transition: "all 0.15s",
      boxShadow: active && hex ? `0 0 20px ${hex}22` : "none",
    }}>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: "32px",
        fontWeight: 800, color: color || "var(--accent)", lineHeight: 1,
      }}>{value ?? "—"}</div>
      <div style={{
        color: "var(--accent3)", fontSize: "10px", letterSpacing: "0.1em",
        marginTop: "6px", fontFamily: "var(--font-ui)", fontWeight: 700,
      }}>{label}</div>
      {sub && <div style={{
        color: "var(--accent2)", fontSize: "10px",
        fontFamily: "var(--font-mono)", marginTop: "3px",
      }}>{sub}</div>}
      {bar != null && (
        <div style={{ marginTop: "10px", height: "3px", background: "var(--border)", borderRadius: "2px" }}>
          <div style={{
            height: "100%", borderRadius: "2px",
            width: `${Math.min(100, Math.max(0, bar))}%`,
            background: color || "var(--cyan)",
            boxShadow: hex ? `0 0 6px ${hex}` : "none",
            transition: "width 0.8s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────
function SevBadge({ sev }) {
  const color = SEV_COLOR[sev] || "var(--accent3)";
  return (
    <span style={{
      display: "inline-block", background: `${color}18`,
      border: `1px solid ${color}40`, color,
      fontSize: "9px", fontWeight: 800, padding: "2px 7px",
      borderRadius: "3px", fontFamily: "var(--font-ui)",
      letterSpacing: "0.08em", whiteSpace: "nowrap",
    }}>{sev}</span>
  );
}

function SvcBadge({ svc }) {
  return (
    <span style={{
      display: "inline-block",
      background: "rgba(0,207,255,0.08)", border: "1px solid rgba(0,207,255,0.2)",
      color: "var(--blue)", fontSize: "9px", fontWeight: 700,
      padding: "2px 6px", borderRadius: "3px",
      fontFamily: "var(--font-ui)", letterSpacing: "0.06em", whiteSpace: "nowrap",
    }}>{svc}</span>
  );
}

function StatusBadge({ status }) {
  return (
    <span style={{
      color: statusColor(status || "open"), fontSize: "9px",
      fontWeight: 700, fontFamily: "var(--font-ui)", letterSpacing: "0.06em",
    }}>{(status || "OPEN").toUpperCase()}</span>
  );
}

// ── Finding row (expandable) ──────────────────────────────────────────────────
function FindingRow({ f, isExpanded, onToggle, onStatusChange, currentStatus }) {
  const svc = f.service || serviceLabel(f.rule_id || "");
  return (
    <div>
      <div onClick={onToggle} style={{
        display: "grid",
        gridTemplateColumns: "88px 130px 58px 1fr 100px 88px 20px",
        gap: "10px", alignItems: "center",
        padding: "9px 16px", cursor: "pointer",
        borderBottom: isExpanded ? "none" : "1px solid var(--border)",
        background: isExpanded ? "rgba(255,230,0,0.025)" : "transparent",
        transition: "background 0.15s",
      }}
      onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = "rgba(255,255,255,0.025)"; }}
      onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = "transparent"; }}>
        <SevBadge sev={f.severity} />
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: "10px", color: "var(--cyan)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{f.rule_id}</div>
        <SvcBadge svc={svc} />
        <div style={{
          color: "var(--accent)", fontSize: "11px", fontFamily: "var(--font-ui)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{f.resource_name || f.resource_id || "—"}</div>
        <div style={{
          color: "var(--accent3)", fontSize: "10px", fontFamily: "var(--font-mono)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{f.account_name || "—"}</div>
        <StatusBadge status={currentStatus} />
        <span style={{
          color: "var(--accent3)", fontSize: "14px",
          transition: "transform 0.2s",
          transform: isExpanded ? "rotate(90deg)" : "none",
          display: "inline-block",
        }}>›</span>
      </div>

      {isExpanded && (
        <div style={{
          padding: "14px 18px 16px",
          borderBottom: "1px solid var(--border)",
          borderLeft: `3px solid ${SEV_COLOR[f.severity] || "var(--border)"}`,
          background: "rgba(255,230,0,0.015)",
        }}>
          <div style={{
            color: "var(--accent)", fontSize: "12px",
            fontFamily: "var(--font-ui)", lineHeight: 1.6, marginBottom: "12px",
          }}>{f.message}</div>

          {f.remediation && (
            <div style={{ marginBottom: "12px" }}>
              <div style={{
                color: "var(--accent3)", fontSize: "9px", fontFamily: "var(--font-ui)",
                fontWeight: 700, letterSpacing: "0.12em", marginBottom: "5px",
              }}>REMEDIATION</div>
              <div style={{
                color: "var(--accent2)", fontSize: "11px",
                fontFamily: "var(--font-mono)", lineHeight: 1.55,
              }}>{f.remediation}</div>
            </div>
          )}

          {f.frameworks?.length > 0 && (
            <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "12px" }}>
              {f.frameworks.map(fw => (
                <span key={fw} style={{
                  background: "rgba(191,95,255,0.08)", border: "1px solid rgba(191,95,255,0.25)",
                  color: "var(--purple)", fontSize: "9px", fontWeight: 700,
                  padding: "2px 7px", borderRadius: "3px", fontFamily: "var(--font-mono)",
                }}>{fw}</span>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{
              color: "var(--accent3)", fontSize: "9px", fontFamily: "var(--font-ui)",
              fontWeight: 700, letterSpacing: "0.1em",
            }}>STATUS:</span>
            {["open", "acknowledged", "resolved"].map(s => (
              <button key={s}
                onClick={e => { e.stopPropagation(); onStatusChange(s); }}
                style={{
                  padding: "3px 10px", borderRadius: "4px", cursor: "pointer",
                  fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 700,
                  letterSpacing: "0.06em",
                  background: currentStatus === s ? `${statusColor(s)}18` : "transparent",
                  border: `1px solid ${currentStatus === s ? statusColor(s) : "var(--border)"}`,
                  color: currentStatus === s ? statusColor(s) : "var(--accent3)",
                  transition: "all 0.15s",
                }}>{s.toUpperCase()}</button>
            ))}
            {f.resource_id && (
              <span style={{
                marginLeft: "auto", color: "var(--accent3)", fontSize: "9px",
                fontFamily: "var(--font-mono)",
              }}>ID: {f.resource_id}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "6px", padding: "8px 12px",
      fontFamily: "var(--font-mono)", fontSize: "11px",
    }}>
      {label && <div style={{ color: "var(--accent2)", marginBottom: 4, fontSize: "10px" }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || "var(--cyan)", fontWeight: 700 }}>
          {p.name !== "score" && p.name !== "count" ? `${p.name}: ` : ""}{p.value}
        </div>
      ))}
    </div>
  );
}

// ── Category Metrics (shown when >1 category) ─────────────────────────────────
const CATEGORY_COLORS = {
  Production:  "#ff2255", Development: "#00cfff", Staging: "#bf5fff",
  Testing:     "#ffe600", Sandbox:     "#39ff14", General: "#8a8070",
};

function CategoryMetrics({ accounts }) {
  const grouped = {};
  accounts.forEach(a => {
    const cat = a.category || "General";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(a);
  });
  const cats = Object.keys(grouped);
  if (cats.length <= 1) return null;

  return (
    <Card style={{ marginBottom: "14px" }}>
      <CardHeader title="CATEGORY METRICS"
        right={<span style={{ color: "var(--accent3)", fontSize: "11px", fontFamily: "var(--font-mono)" }}>{cats.length} categories</span>} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: "0" }}>
        {cats.map(cat => {
          const accs = grouped[cat];
          const scores = accs.map(a => a.latest_score).filter(s => s != null);
          const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
          const fc = accs.reduce((t, a) => {
            const c = a.finding_counts || {};
            return { critical: t.critical + (c.critical||0), high: t.high + (c.high||0),
                     medium: t.medium + (c.medium||0), low: t.low + (c.low||0) };
          }, { critical:0, high:0, medium:0, low:0 });
          const color = CATEGORY_COLORS[cat] || "var(--accent3)";
          return (
            <div key={cat} style={{
              padding: "14px 16px", borderRight: "1px solid var(--border)",
              borderBottom: "1px solid var(--border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: color,
                              boxShadow: `0 0 4px ${color}` }} />
                <span style={{ color: "var(--accent)", fontSize: "11px",
                               fontWeight: 700, fontFamily: "var(--font-ui)" }}>{cat}</span>
                <span style={{ color: "var(--accent3)", fontSize: "10px",
                               fontFamily: "var(--font-mono)", marginLeft: "auto" }}>
                  {accs.length} acct{accs.length !== 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 8 }}>
                <span style={{ color: scoreColor(avg), fontSize: "22px",
                               fontWeight: 800, fontFamily: "var(--font-display)" }}>
                  {avg ?? "—"}
                </span>
                <span style={{ color: scoreColor(avg), fontSize: "9px",
                               fontFamily: "var(--font-ui)", fontWeight: 700 }}>
                  {scoreLabel(avg)}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["C", fc.critical, SEV_COLOR.CRITICAL], ["H", fc.high, SEV_COLOR.HIGH],
                  ["M", fc.medium, SEV_COLOR.MEDIUM], ["L", fc.low, SEV_COLOR.LOW]].map(([k, v, c]) => (
                  <div key={k} style={{ textAlign: "center" }}>
                    <div style={{ color: v > 0 ? c : "var(--accent3)", fontSize: "14px",
                                  fontWeight: 700, fontFamily: "var(--font-display)" }}>{v}</div>
                    <div style={{ color: "var(--accent3)", fontSize: "8px",
                                  fontFamily: "var(--font-ui)", letterSpacing: "0.08em" }}>{k}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────
export default function DashboardPage({ token, role, onScanComplete, onNavigate, isActive }) {
  const canScan = role !== "viewer";
  const [data,         setData]         = useState(null);
  const [fetching,     setFetching]     = useState(true);
  const [fetchErr,     setFetchErr]     = useState(null);
  const [scanning,     setScanning]     = useState(null);
  const [scanErr,      setScanErr]      = useState(null);
  const [timeRange,    setTimeRange]    = useState("all");
  const [sevFilter,    setSevFilter]    = useState("ALL");
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [statuses,     setStatuses]     = useState({});
  const [expanded,     setExpanded]     = useState(null);
  const [bulkScanning, setBulkScanning] = useState(false);
  const [toast,        setToast]        = useState(null);
  const lastFetch = useRef(0);

  const showToast = (msg, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchDashboard = useCallback(async (range) => {
    lastFetch.current = Date.now();
    setFetching(true); setFetchErr(null);
    const url = range !== "all" ? `${API}/dashboard?days=${range}` : `${API}/dashboard`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setData(await res.json());
      else { const e = await res.json().catch(() => ({})); setFetchErr(e.detail || "Failed to load."); }
    } catch { setFetchErr("Cannot reach backend."); }
    finally { setFetching(false); }
  }, [token]);

  useEffect(() => { fetchDashboard(timeRange); }, [fetchDashboard, timeRange]);

  useEffect(() => {
    if (!isActive) return;
    if (Date.now() - lastFetch.current > 30000) fetchDashboard(timeRange);
  }, [isActive]);

  async function handleScan(account) {
    setScanning(account.id); setScanErr(null);
    try {
      const res = await fetch(`${API}/accounts/${account.id}/scan`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        await fetchDashboard(timeRange);
        onScanComplete(result);
        showToast(`✓ ${account.name} scanned successfully`);
      } else {
        const e = await res.json().catch(() => ({}));
        setScanErr(e.detail || "Scan failed.");
      }
    } catch { setScanErr("Cannot reach backend."); }
    finally { setScanning(null); }
  }

  async function handleBulkScan() {
    setBulkScanning(true);
    try {
      const res = await fetch(`${API}/accounts/scan-all`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) {
        await fetchDashboard(timeRange);
        showToast(`✓ ${d.success_count}/${d.results?.length} accounts scanned` +
          (d.fail_count > 0 ? ` · ${d.fail_count} failed` : ""));
      } else showToast(d.detail || "Bulk scan failed.", true);
    } catch { showToast("Cannot reach backend.", true); }
    finally { setBulkScanning(false); }
  }

  async function handleStatus(f, status) {
    const key = `${f.rule_id}::${f.resource_id}`;
    try {
      const res = await fetch(`${API}/finding-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ finding_key: key, status }),
      });
      if (res.ok) setStatuses(p => ({ ...p, [key]: status }));
    } catch {}
  }

  function getStatus(f) {
    return statuses[`${f.rule_id}::${f.resource_id}`] || f.status || "open";
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const d              = data || {};
  const accounts       = d.accounts       || [];
  const recentFindings = d.recent_findings || [];
  const overallScore   = d.overall_score  ?? null;
  const totalAccounts  = d.total_accounts ?? 0;
  const scannedAccounts = d.scanned_accounts ?? 0;
  const trend          = d.trend          || [];
  const trendAccounts  = d.trend_accounts || [];

  // Compute all 4 severity totals consistently from account finding_counts
  const totalCritical = d.total_critical ?? 0;
  const totalHigh     = d.total_high     ?? 0;
  const totalMedium   = accounts.reduce((s, a) => s + (a.finding_counts?.medium || 0), 0);
  const totalLow      = accounts.reduce((s, a) => s + (a.finding_counts?.low    || 0), 0);
  const totalFindings = totalCritical + totalHigh + totalMedium + totalLow;

  const sevData = [
    { name: "CRITICAL", value: totalCritical, color: SEV_COLOR.CRITICAL },
    { name: "HIGH",     value: totalHigh,     color: SEV_COLOR.HIGH },
    { name: "MEDIUM",   value: totalMedium,   color: SEV_COLOR.MEDIUM },
    { name: "LOW",      value: totalLow,      color: SEV_COLOR.LOW },
  ].filter(x => x.value > 0);

  const scoreBarData = accounts
    .filter(a => a.latest_score != null)
    .map(a => ({
      name: a.name.length > 14 ? a.name.slice(0, 13) + "…" : a.name,
      score: a.latest_score,
      fill: scoreColor(a.latest_score),
    }));

  // Top services — fixed: parse AWS-S3-003 format, use f.service if present
  const svcMap = {};
  recentFindings.forEach(f => {
    const svc = f.service || serviceLabel(f.rule_id || "");
    svcMap[svc] = (svcMap[svc] || 0) + 1;
  });
  const topServices = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));

  const filteredFindings = useMemo(() => recentFindings.filter(f => {
    if (sevFilter !== "ALL" && f.severity !== sevFilter) return false;
    if (statusFilter !== "ALL") {
      const st = statuses[`${f.rule_id}::${f.resource_id}`] || f.status || "open";
      if (st !== statusFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (f.rule_id || "").toLowerCase().includes(q)
          || (f.resource_name || "").toLowerCase().includes(q)
          || (f.message || "").toLowerCase().includes(q)
          || (f.account_name || "").toLowerCase().includes(q);
    }
    return true;
  }), [recentFindings, sevFilter, statusFilter, search, statuses]);

  const trendColors = ["#ffe600", "#00cfff", "#39ff14", "#bf5fff", "#ff6b00"];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "24px 28px", maxWidth: "1400px", margin: "0 auto",
                  animation: "fadeIn 0.3s ease" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: "20px", right: "20px", zIndex: 9999,
          padding: "12px 20px", borderRadius: "8px",
          background: toast.err ? "rgba(255,34,85,0.12)" : "rgba(57,255,20,0.08)",
          border: `1px solid ${toast.err ? "rgba(255,34,85,0.3)" : "rgba(57,255,20,0.25)"}`,
          color: toast.err ? "#ff2255" : "#39ff14",
          fontFamily: "var(--font-mono)", fontSize: "12px",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>{toast.msg}</div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: "20px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "20px",
                       fontWeight: 700, color: "var(--accent)",
                       letterSpacing: "0.05em", margin: 0 }}>DASHBOARD</h1>
          <div style={{ color: "var(--accent3)", fontSize: "12px", marginTop: "5px",
                        fontFamily: "var(--font-mono)", display: "flex",
                        alignItems: "center", gap: "6px" }}>
            {fetching
              ? <><span style={{
                  width: 8, height: 8, border: "1.5px solid var(--border)",
                  borderTop: "1.5px solid var(--cyan)", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", display: "inline-block",
                }} /> LOADING...</>
              : <>
                  <span>{scannedAccounts}/{totalAccounts} accounts scanned</span>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span style={{ color: totalFindings > 0 ? SEV_COLOR.HIGH : "#39ff14",
                                 fontWeight: 700 }}>
                    {totalFindings} total findings
                  </span>
                </>}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {[["all","ALL"],["7","7D"],["30","30D"],["90","90D"]].map(([v, l]) => (
            <button key={v} onClick={() => setTimeRange(v)} style={{
              padding: "5px 10px", borderRadius: 5, fontSize: 10,
              fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.08em",
              cursor: "pointer", border: "1px solid var(--border)",
              background: timeRange === v ? "rgba(255,230,0,0.12)" : "transparent",
              color: timeRange === v ? "var(--cyan)" : "var(--accent3)",
              transition: "all 0.15s",
            }}>{l}</button>
          ))}
          <button onClick={() => fetchDashboard(timeRange)} disabled={fetching} style={{
            padding: "5px 10px", borderRadius: 5, fontSize: 10,
            fontFamily: "var(--font-ui)", fontWeight: 700, cursor: "pointer",
            border: "1px solid var(--border)", background: "transparent",
            color: "var(--accent3)", opacity: fetching ? 0.5 : 1,
          }}>↻</button>
          {canScan && (
            <button onClick={handleBulkScan} disabled={bulkScanning || fetching}
              className="neon-btn" style={{
                padding: "5px 14px", borderRadius: 5, fontSize: 10,
                fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.06em",
                cursor: bulkScanning ? "not-allowed" : "pointer",
                border: "1px solid rgba(255,230,0,0.35)",
                background: "rgba(255,230,0,0.08)", color: "var(--cyan)",
                opacity: bulkScanning ? 0.6 : 1,
              }}>{bulkScanning ? "SCANNING…" : "⚡ SCAN ALL"}</button>
          )}
        </div>
      </div>

      {/* Error banners */}
      {fetchErr && (
        <div style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 8,
                      background: "rgba(255,34,85,0.08)", border: "1px solid rgba(255,34,85,0.25)",
                      color: "#ff2255", fontFamily: "var(--font-mono)", fontSize: "12px" }}>
          ⚠ {fetchErr}
        </div>
      )}
      {scanErr && (
        <div style={{ marginBottom: 14, padding: "10px 16px", borderRadius: 8,
                      background: "rgba(255,34,85,0.08)", border: "1px solid rgba(255,34,85,0.25)",
                      color: "#ff2255", fontFamily: "var(--font-mono)", fontSize: "12px",
                      display: "flex", alignItems: "center", gap: 10 }}>
          ⚠ {scanErr}
          <button onClick={() => setScanErr(null)} style={{
            marginLeft: "auto", background: "transparent", border: "none",
            color: "#ff2255", cursor: "pointer",
          }}>✕</button>
        </div>
      )}

      {/* ── Stat Cards: 6 cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)",
                    gap: "12px", marginBottom: "14px" }}>
        <StatCard label="SECURITY SCORE" value={overallScore}
                  color={scoreColor(overallScore)} sub={scoreLabel(overallScore)}
                  bar={overallScore} />
        <StatCard label="ACCOUNTS" value={totalAccounts}
                  color="var(--blue)" sub={`${scannedAccounts} scanned`} />
        <StatCard label="CRITICAL" value={totalCritical}
                  color={totalCritical > 0 ? SEV_COLOR.CRITICAL : "var(--accent3)"}
                  active={sevFilter === "CRITICAL"}
                  onClick={() => setSevFilter(f => f === "CRITICAL" ? "ALL" : "CRITICAL")} />
        <StatCard label="HIGH" value={totalHigh}
                  color={totalHigh > 0 ? SEV_COLOR.HIGH : "var(--accent3)"}
                  active={sevFilter === "HIGH"}
                  onClick={() => setSevFilter(f => f === "HIGH" ? "ALL" : "HIGH")} />
        <StatCard label="MEDIUM" value={totalMedium}
                  color={totalMedium > 0 ? SEV_COLOR.MEDIUM : "var(--accent3)"}
                  active={sevFilter === "MEDIUM"}
                  onClick={() => setSevFilter(f => f === "MEDIUM" ? "ALL" : "MEDIUM")} />
        <StatCard label="LOW" value={totalLow}
                  color={totalLow > 0 ? SEV_COLOR.LOW : "var(--accent3)"}
                  active={sevFilter === "LOW"}
                  onClick={() => setSevFilter(f => f === "LOW" ? "ALL" : "LOW")} />
      </div>

      {/* ── Category Metrics ── */}
      <CategoryMetrics accounts={accounts} />

      {/* ── Charts row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr",
                    gap: "14px", marginBottom: "14px" }}>

        {/* Risk breakdown donut */}
        <Card>
          <CardHeader title="RISK BREAKDOWN"
            right={<span style={{ color: "var(--accent3)", fontFamily: "var(--font-mono)",
                                  fontSize: "11px" }}>{totalFindings} total</span>} />
          <div style={{ padding: "12px 0 0", position: "relative" }}>
            {sevData.length > 0 ? (
              <>
                <div style={{ position: "relative" }}>
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie data={sevData} cx="50%" cy="50%"
                           innerRadius={52} outerRadius={76}
                           paddingAngle={3} dataKey="value" strokeWidth={0}>
                        {sevData.map((e, i) => (
                          <Cell key={i} fill={e.color}
                                onClick={() => setSevFilter(f => f === e.name ? "ALL" : e.name)}
                                style={{ filter: `drop-shadow(0 0 5px ${e.color}88)`, cursor: "pointer" }} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center score overlay */}
                  <div style={{
                    position: "absolute", top: "50%", left: "50%",
                    transform: "translate(-50%, -50%)", textAlign: "center",
                    pointerEvents: "none",
                  }}>
                    <div style={{ color: scoreColor(overallScore), fontSize: "26px",
                                  fontWeight: 800, fontFamily: "var(--font-display)",
                                  lineHeight: 1 }}>
                      {overallScore ?? "—"}
                    </div>
                    <div style={{ color: "var(--accent3)", fontSize: "9px",
                                  fontFamily: "var(--font-ui)", letterSpacing: "0.15em",
                                  marginTop: "2px" }}>
                      {scoreLabel(overallScore)}
                    </div>
                  </div>
                </div>

                {/* Legend with proportion bars */}
                <div style={{ padding: "4px 16px 14px" }}>
                  {sevData.map(s => (
                    <div key={s.name}
                         onClick={() => setSevFilter(f => f === s.name ? "ALL" : s.name)}
                         style={{
                           display: "flex", alignItems: "center", gap: 8,
                           marginBottom: 7, cursor: "pointer",
                           opacity: sevFilter !== "ALL" && sevFilter !== s.name ? 0.4 : 1,
                           transition: "opacity 0.15s",
                         }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                                    background: s.color, boxShadow: `0 0 4px ${s.color}` }} />
                      <span style={{ color: "var(--accent2)", fontSize: "10px",
                                     fontFamily: "var(--font-ui)", fontWeight: 600,
                                     letterSpacing: "0.06em", width: 56 }}>{s.name}</span>
                      <div style={{ flex: 1, height: 3, background: "var(--border)",
                                    borderRadius: 2, overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 2,
                          width: totalFindings > 0 ? `${(s.value / totalFindings) * 100}%` : "0%",
                          background: s.color, transition: "width 0.6s",
                        }} />
                      </div>
                      <span style={{ color: s.color, fontSize: "11px",
                                     fontFamily: "var(--font-mono)", fontWeight: 700,
                                     width: 28, textAlign: "right" }}>{s.value}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ height: 200, display: "flex", alignItems: "center",
                            justifyContent: "center", color: "var(--accent3)",
                            fontFamily: "var(--font-ui)", fontSize: "12px" }}>
                No findings yet
              </div>
            )}
          </div>
        </Card>

        {/* Account security scores */}
        <Card>
          <CardHeader title="ACCOUNT SECURITY SCORES"
            right={<span style={{ color: "var(--accent3)", fontFamily: "var(--font-mono)",
                                  fontSize: "11px" }}>0 – 100</span>} />
          <div style={{ padding: "8px 8px 0" }}>
            {scoreBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={scoreBarData} margin={{ top: 12, right: 20, bottom: 8, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name"
                         tick={{ fill: "var(--accent2)", fontSize: 11, fontFamily: "var(--font-ui)" }}
                         axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]}
                         tick={{ fill: "var(--accent3)", fontSize: 9 }}
                         axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTip />} />
                  <Bar dataKey="score" name="Score" radius={[5, 5, 0, 0]} maxBarSize={72}>
                    {scoreBarData.map((e, i) => (
                      <Cell key={i} fill={e.fill}
                            style={{ filter: `drop-shadow(0 0 8px ${e.fill}55)` }} />
                    ))}
                    <LabelList dataKey="score" position="top"
                               style={{ fill: "var(--accent)", fontSize: 12,
                                        fontFamily: "var(--font-display)", fontWeight: 800 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 190, display: "flex", alignItems: "center",
                            justifyContent: "center", color: "var(--accent3)",
                            fontFamily: "var(--font-ui)", fontSize: "12px" }}>
                No scan data — run a scan first
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* ── Account Health table ── */}
      <Card style={{ marginBottom: "14px" }}>
        <CardHeader title="ACCOUNT HEALTH"
          right={canScan ? (
            <button onClick={handleBulkScan} disabled={bulkScanning} className="neon-btn"
              style={{
                padding: "4px 10px", borderRadius: 4, fontSize: 9,
                fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.08em",
                cursor: bulkScanning ? "not-allowed" : "pointer",
                border: "1px solid rgba(255,230,0,0.3)",
                background: "rgba(255,230,0,0.06)", color: "var(--cyan)",
              }}>{bulkScanning ? "SCANNING…" : "⚡ SCAN ALL"}</button>
          ) : null} />

        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "14px 1fr 90px 80px 52px 52px 52px 52px 100px 90px",
          gap: "10px", padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
        }}>
          {["", "ACCOUNT", "SCORE", "RISK", "CRIT", "HIGH", "MED", "LOW", "LAST SCAN", ""].map((h, i) => (
            <div key={i} style={{
              color: "var(--accent3)", fontSize: "9px", fontFamily: "var(--font-ui)",
              fontWeight: 700, letterSpacing: "0.1em",
              textAlign: i >= 4 && i <= 7 ? "center" : "left",
            }}>{h}</div>
          ))}
        </div>

        {accounts.length === 0 ? (
          <div style={{ padding: "32px", textAlign: "center", color: "var(--accent3)",
                        fontFamily: "var(--font-ui)", fontSize: "12px" }}>
            No accounts connected — go to Accounts to add one
          </div>
        ) : accounts.map(account => {
          const score = account.latest_score;
          const fc    = account.finding_counts || {};
          const isScanning = scanning === account.id;
          return (
            <div key={account.id} style={{
              display: "grid",
              gridTemplateColumns: "14px 1fr 90px 80px 52px 52px 52px 52px 100px 90px",
              gap: "10px", alignItems: "center",
              padding: "11px 16px", borderBottom: "1px solid var(--border)",
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

              {/* Cloud dot */}
              <div style={{
                width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
                background: account.cloud === "aws" ? "#ff9900" : "#0089d6",
                boxShadow: account.cloud === "aws"
                  ? "0 0 6px rgba(255,153,0,0.5)" : "0 0 6px rgba(0,137,214,0.5)",
              }} />

              {/* Name + cloud/region */}
              <div>
                <div style={{ color: "var(--accent)", fontSize: "13px",
                              fontWeight: 600, fontFamily: "var(--font-ui)" }}>
                  {account.name}
                </div>
                <div style={{ color: "var(--accent3)", fontSize: "10px",
                              fontFamily: "var(--font-mono)", marginTop: 1 }}>
                  {account.cloud.toUpperCase()}
                  {account.region ? ` · ${account.region}` : ""}
                  {account.category && account.category !== "General"
                    ? ` · ${account.category}` : ""}
                </div>
              </div>

              {/* Score */}
              <div>
                <span style={{ color: scoreColor(score), fontSize: "18px",
                               fontWeight: 800, fontFamily: "var(--font-display)" }}>
                  {score ?? "—"}
                </span>
                {score != null && (
                  <div style={{ marginTop: 3, height: "3px",
                                background: "var(--border)", borderRadius: "2px" }}>
                    <div style={{ height: "100%", borderRadius: "2px",
                                  width: `${score}%`, background: scoreColor(score),
                                  boxShadow: `0 0 5px ${scoreColor(score)}` }} />
                  </div>
                )}
              </div>

              {/* Risk label */}
              <div style={{ color: scoreColor(score), fontSize: "10px",
                            fontFamily: "var(--font-ui)", fontWeight: 700,
                            letterSpacing: "0.06em" }}>
                {scoreLabel(score)}
              </div>

              {/* C / H / M / L */}
              {["critical","high","medium","low"].map(sev => (
                <div key={sev} style={{ textAlign: "center" }}>
                  <span style={{
                    color: (fc[sev] || 0) > 0 ? SEV_COLOR[sev.toUpperCase()] : "var(--accent3)",
                    fontSize: "14px", fontWeight: (fc[sev] || 0) > 0 ? 700 : 400,
                    fontFamily: "var(--font-display)",
                  }}>{fc[sev] ?? 0}</span>
                </div>
              ))}

              {/* Last scan */}
              <div style={{ color: "var(--accent3)", fontSize: "10px",
                            fontFamily: "var(--font-mono)" }}>
                {timeAgo(account.last_scanned_at)}
              </div>

              {/* Scan button */}
              {canScan ? (
                <button onClick={() => handleScan(account)}
                  disabled={isScanning || bulkScanning}
                  className="neon-btn"
                  style={{
                    padding: "5px 12px", border: "1px solid rgba(255,230,0,0.3)",
                    borderRadius: "4px", background: "transparent",
                    color: isScanning ? "var(--accent3)" : "var(--cyan)",
                    fontFamily: "var(--font-ui)", fontSize: "10px",
                    fontWeight: 700, letterSpacing: "0.06em",
                    cursor: (isScanning || bulkScanning) ? "not-allowed" : "pointer",
                    opacity: bulkScanning && !isScanning ? 0.5 : 1,
                  }}>
                  {isScanning ? "SCANNING…" : "SCAN NOW"}
                </button>
              ) : (
                <span style={{ color: "var(--accent3)", fontSize: "9px",
                               fontFamily: "var(--font-ui)", letterSpacing: "0.06em" }}>
                  READ ONLY
                </span>
              )}
            </div>
          );
        })}
      </Card>

      {/* ── Findings + Top Services ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px",
                    gap: "14px", marginBottom: "14px" }}>

        {/* Findings panel */}
        <Card>
          <CardHeader title={`FINDINGS ${filteredFindings.length !== recentFindings.length
            ? `(${filteredFindings.length} of ${recentFindings.length})` : `(${recentFindings.length})`}`}
            right={
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                {/* Severity pills */}
                {["ALL","CRITICAL","HIGH","MEDIUM","LOW"].map(s => (
                  <button key={s} onClick={() => setSevFilter(s)} style={{
                    padding: "3px 7px", borderRadius: 4, fontSize: 9,
                    fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.06em",
                    cursor: "pointer",
                    border: `1px solid ${sevFilter === s
                      ? (SEV_COLOR[s] || "var(--cyan)") : "var(--border)"}`,
                    background: sevFilter === s
                      ? `${SEV_COLOR[s] || "#ffe600"}14` : "transparent",
                    color: sevFilter === s
                      ? (SEV_COLOR[s] || "var(--cyan)") : "var(--accent3)",
                    transition: "all 0.15s",
                  }}>{s}</button>
                ))}
                {/* Status filter */}
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  style={{
                    padding: "3px 6px", borderRadius: 4, fontSize: 9,
                    fontFamily: "var(--font-ui)", fontWeight: 700,
                    background: "var(--card)", border: "1px solid var(--border)",
                    color: "var(--accent3)", cursor: "pointer",
                  }}>
                  <option value="ALL">ALL STATUS</option>
                  <option value="open">OPEN</option>
                  <option value="acknowledged">ACKNOWLEDGED</option>
                  <option value="resolved">RESOLVED</option>
                </select>
                {/* Search */}
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="search…"
                  style={{
                    padding: "3px 8px", borderRadius: 4, fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    background: "var(--surface)", border: "1px solid var(--border)",
                    color: "var(--accent)", width: 120,
                  }} />
              </div>
            } />

          {/* Table column headers */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "88px 130px 58px 1fr 100px 88px 20px",
            gap: "10px", padding: "7px 16px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
          }}>
            {["SEV", "RULE ID", "SERVICE", "RESOURCE", "ACCOUNT", "STATUS", ""].map((h, i) => (
              <div key={i} style={{ color: "var(--accent3)", fontSize: "9px",
                                    fontFamily: "var(--font-ui)", fontWeight: 700,
                                    letterSpacing: "0.1em" }}>{h}</div>
            ))}
          </div>

          {filteredFindings.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--accent3)",
                          fontFamily: "var(--font-ui)", fontSize: "12px" }}>
              {recentFindings.length === 0
                ? "No findings — run a scan to populate this view"
                : "No findings match the current filter"}
            </div>
          ) : (
            <div style={{ maxHeight: "500px", overflowY: "auto" }}>
              {filteredFindings.map((f, i) => {
                const key = `${f.rule_id}::${f.resource_id}::${i}`;
                return (
                  <FindingRow key={key} f={f}
                    isExpanded={expanded === key}
                    onToggle={() => setExpanded(p => p === key ? null : key)}
                    onStatusChange={s => handleStatus(f, s)}
                    currentStatus={getStatus(f)} />
                );
              })}
            </div>
          )}

          {filteredFindings.length > 0 && (
            <div style={{ padding: "7px 16px", borderTop: "1px solid var(--border)",
                          color: "var(--accent3)", fontSize: "10px",
                          fontFamily: "var(--font-mono)" }}>
              Click a row to expand — see message, remediation, frameworks &amp; update status
            </div>
          )}
        </Card>

        {/* Top affected services */}
        <Card>
          <CardHeader title="TOP SERVICES"
            right={<span style={{ color: "var(--accent3)", fontSize: "11px",
                                  fontFamily: "var(--font-mono)" }}>
              {topServices.length} services
            </span>} />
          <div style={{ padding: "14px 16px" }}>
            {topServices.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center",
                            color: "var(--accent3)", fontFamily: "var(--font-ui)", fontSize: "12px" }}>
                No data
              </div>
            ) : topServices.map(({ name, count }) => {
              const maxCount = topServices[0]?.count || 1;
              const pct = (count / maxCount) * 100;
              return (
                <div key={name} style={{ marginBottom: "11px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                                alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ color: "var(--accent)", fontSize: "12px",
                                   fontFamily: "var(--font-ui)", fontWeight: 600 }}>{name}</span>
                    <span style={{ color: "var(--cyan)", fontSize: "11px",
                                   fontFamily: "var(--font-mono)", fontWeight: 700 }}>{count}</span>
                  </div>
                  <div style={{ height: "5px", background: "var(--border)",
                                borderRadius: "3px", overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: "3px",
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${SEV_COLOR.HIGH}, ${SEV_COLOR.MEDIUM})`,
                      transition: "width 0.6s ease",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* ── Score trend ── */}
      {trend.length > 1 && (
        <Card>
          <CardHeader title="SECURITY SCORE TREND"
            right={<span style={{ color: "var(--accent3)", fontSize: "11px",
                                  fontFamily: "var(--font-mono)" }}>
              {trend.length} data points
            </span>} />
          <div style={{ padding: "8px 8px 0" }}>
            <ResponsiveContainer width="100%" height={150}>
              <LineChart data={trend} margin={{ top: 8, right: 24, bottom: 8, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="date"
                       tick={{ fill: "var(--accent3)", fontSize: 9, fontFamily: "var(--font-mono)" }}
                       axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]}
                       tick={{ fill: "var(--accent3)", fontSize: 9 }}
                       axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTip />} />
                {trendAccounts.map((acc, i) => (
                  <Line key={acc} type="monotone" dataKey={acc} name={acc}
                        stroke={trendColors[i % trendColors.length]}
                        strokeWidth={2} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}
