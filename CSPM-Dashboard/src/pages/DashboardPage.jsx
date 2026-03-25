import { useState, useEffect, useCallback, useRef } from "react";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const SEV_COLOR = {
  CRITICAL: "#ff2255", HIGH: "#ff6b00",
  MEDIUM:   "#ffe600", LOW:  "#39ff14",
};

function scoreColor(s) {
  if (s == null) return "var(--accent3)";
  if (s >= 70)   return "#39ff14";
  if (s >= 50)   return "#ffe600";
  if (s >= 30)   return "#ff6b00";
  return "#ff2255";
}
function scoreLabel(s) {
  if (s == null) return "NO DATA";
  if (s >= 70)   return "LOW RISK";
  if (s >= 50)   return "MED RISK";
  if (s >= 30)   return "HIGH RISK";
  return "CRITICAL";
}

function serviceLabel(ruleId = "") {
  const r = ruleId.toLowerCase();
  if (r.includes("_iam_"))        return "IAM";
  if (r.includes("_s3_"))         return "S3";
  if (r.includes("_ec2_"))        return "EC2";
  if (r.includes("_rds_"))        return "RDS";
  if (r.includes("_cloudtrail"))  return "CloudTrail";
  if (r.includes("_guardduty"))   return "GuardDuty";
  if (r.includes("_kms_"))        return "KMS";
  if (r.includes("_lambda"))      return "Lambda";
  if (r.includes("_vpc_"))        return "VPC";
  if (r.includes("_elb_") || r.includes("_alb_")) return "Load Balancer";
  if (r.startsWith("azure_")) {
    const parts = r.split("_");
    return (parts[1] || "azure").toUpperCase();
  }
  const parts = r.split("_");
  return (parts[1] || parts[0] || "OTHER").toUpperCase();
}

// ── Shared card wrapper ────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
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
      padding: "14px 20px", borderBottom: "1px solid var(--border)",
      display: "flex", justifyContent: "space-between", alignItems: "center",
    }}>
      <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)",
                     fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em" }}>
        {title}
      </span>
      {right && <span style={{ color: "var(--accent3)", fontSize: "11px",
                               fontFamily: "var(--font-mono)" }}>{right}</span>}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, sub, bar }) {
  const pct = bar != null ? Math.min(100, Math.max(0, bar)) : null;
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: "10px", padding: "18px 20px",
    }}>
      <div style={{
        fontFamily: "var(--font-display)", fontSize: "34px",
        fontWeight: 800, color: color || "var(--accent)", lineHeight: 1,
      }}>{value ?? "—"}</div>
      <div style={{ color: "var(--accent3)", fontSize: "10px",
                    letterSpacing: "0.1em", marginTop: "6px",
                    fontFamily: "var(--font-ui)", fontWeight: 600 }}>{label}</div>
      {sub && (
        <div style={{ color: color || "var(--accent3)", fontSize: "10px",
                      fontFamily: "var(--font-ui)", marginTop: "2px",
                      letterSpacing: "0.06em" }}>{sub}</div>
      )}
      {pct != null && (
        <div style={{ marginTop: "10px", height: "3px",
                      background: "var(--border)", borderRadius: "2px" }}>
          <div style={{
            height: "100%", borderRadius: "2px",
            width: `${pct}%`,
            background: color || "var(--cyan)",
            boxShadow: `0 0 6px ${color || "var(--cyan)"}`,
            transition: "width 0.8s ease",
          }} />
        </div>
      )}
    </div>
  );
}

// ── Custom donut center label ─────────────────────────────────────────────────
function DonutCenter({ cx, cy, score }) {
  return (
    <g>
      <text x={cx} y={cy - 8} textAnchor="middle" dominantBaseline="middle"
            fill={scoreColor(score)} fontSize={28} fontWeight={800}
            fontFamily="var(--font-display)">
        {score ?? "—"}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" dominantBaseline="middle"
            fill="#4a4535" fontSize={10} fontWeight={600}
            fontFamily="var(--font-ui)" letterSpacing="2">
        {scoreLabel(score)}
      </text>
    </g>
  );
}

// ── Custom tooltip shared style ───────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: {
    background: "#0c0d10", border: "1px solid rgba(255,230,0,0.2)",
    borderRadius: "6px", fontSize: "12px",
  },
  labelStyle:   { color: "#f0e8c0", fontFamily: "var(--font-ui)", marginBottom: 4 },
  itemStyle:    { fontFamily: "var(--font-mono)", fontSize: "11px" },
  cursor:       { fill: "rgba(255,230,0,0.04)" },
};

// ── Account Health Row ────────────────────────────────────────────────────────
function AccountRow({ account, onScanClick, canScan }) {
  const score = account.latest_score;
  const fc    = account.finding_counts || {};
  const total = (fc.critical||0) + (fc.high||0) + (fc.medium||0) + (fc.low||0);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "28px 1fr 120px 60px 60px 60px 60px 110px",
      gap: "12px", alignItems: "center",
      padding: "12px 20px", borderBottom: "1px solid var(--border)",
      transition: "background 0.15s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

      <div style={{ width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0,
                    background: account.cloud === "aws" ? "#ff9900" : "#0089d6",
                    boxShadow: account.cloud === "aws"
                      ? "0 0 6px rgba(255,153,0,0.5)" : "0 0 6px rgba(0,137,214,0.5)" }} />

      <div>
        <div style={{ color: "var(--accent)", fontSize: "13px",
                      fontWeight: 600, fontFamily: "var(--font-ui)" }}>{account.name}</div>
        <div style={{ color: "var(--accent3)", fontSize: "11px",
                      fontFamily: "var(--font-mono)", marginTop: "2px" }}>
          {account.cloud.toUpperCase()}{account.region ? ` · ${account.region}` : ""}
        </div>
      </div>

      {/* Score with mini bar */}
      <div>
        {score != null ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ color: scoreColor(score), fontSize: "18px",
                             fontWeight: 800, fontFamily: "var(--font-display)",
                             lineHeight: 1 }}>{score}</span>
              <span style={{ color: scoreColor(score), fontSize: "9px",
                             letterSpacing: "0.06em", fontFamily: "var(--font-ui)" }}>
                {scoreLabel(score)}
              </span>
            </div>
            <div style={{ marginTop: 5, height: "3px",
                          background: "var(--border)", borderRadius: "2px" }}>
              <div style={{ height: "100%", borderRadius: "2px",
                            width: `${score}%`, background: scoreColor(score),
                            boxShadow: `0 0 5px ${scoreColor(score)}` }} />
            </div>
          </>
        ) : (
          <div style={{ color: "var(--accent3)", fontSize: "11px",
                        fontFamily: "var(--font-mono)" }}>NO DATA</div>
        )}
      </div>

      {/* Finding severity counts */}
      {["critical","high","medium","low"].map(sev => (
        <div key={sev} style={{ textAlign: "center" }}>
          <span style={{
            color: fc[sev] > 0 ? SEV_COLOR[sev.toUpperCase()] : "var(--accent3)",
            fontSize: "14px", fontWeight: fc[sev] > 0 ? 700 : 400,
            fontFamily: "var(--font-display)",
          }}>{fc[sev] ?? 0}</span>
        </div>
      ))}

      {canScan ? (
        <button onClick={() => onScanClick(account)} className="neon-btn" style={{
          padding: "6px 12px", border: "1px solid rgba(255,230,0,0.3)",
          borderRadius: "5px", background: "transparent",
          color: "var(--cyan)", fontFamily: "var(--font-ui)",
          fontSize: "11px", fontWeight: 600, cursor: "pointer",
          letterSpacing: "0.06em",
        }}>SCAN NOW</button>
      ) : (
        <div style={{ fontSize: "10px", color: "var(--accent3)",
                      fontFamily: "var(--font-ui)", letterSpacing: "0.06em",
                      textAlign: "center" }}>READ ONLY</div>
      )}
    </div>
  );
}

// ── Empty slot ────────────────────────────────────────────────────────────────
function EmptySlot({ icon, text, sub, height = 140 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: "8px",
                  height, color: "var(--accent3)" }}>
      {icon && <div style={{ fontSize: "24px", opacity: 0.35 }}>{icon}</div>}
      <div style={{ fontFamily: "var(--font-ui)", fontSize: "12px",
                    letterSpacing: "0.06em" }}>{text}</div>
      {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: "10px",
                            opacity: 0.5, textAlign: "center", padding: "0 20px" }}>{sub}</div>}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage({ token, role, onScanComplete, onNavigate, isActive }) {
  const canScan = role !== "viewer";
  const [data,      setData]      = useState(null);
  const [fetching,  setFetching]  = useState(true);
  const [fetchErr,  setFetchErr]  = useState(null);
  const [scanning,  setScanning]  = useState(null);
  const [scanErr,   setScanErr]   = useState(null);
  const [sevFilter,    setSevFilter]    = useState("ALL");
  const [findingSearch, setFindingSearch] = useState("");
  const [statusFilter,  setStatusFilter]  = useState("ALL");
  const lastFetchRef = useRef(0);
  const [statuses,      setStatuses]     = useState({});
  const [expanded,      setExpanded]     = useState(null);
  const [statusMsg,     setStatusMsg]    = useState(null);
  const [timeRange,     setTimeRange]    = useState("all");
  const [bulkScanning,  setBulkScanning] = useState(false);
  const [bulkToast,     setBulkToast]    = useState(null);

  const fetchDashboard = useCallback(async (range) => {
    lastFetchRef.current = Date.now();
    setFetching(true);
    setFetchErr(null);
    const days = range === "all" ? null : range;
    const url  = days ? `${API}/dashboard?days=${days}` : `${API}/dashboard`;
    try {
      const res = await fetch(url, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        const d = await res.json().catch(() => ({}));
        setFetchErr(d.detail || "Failed to load dashboard data. Please refresh.");
      }
    } catch {
      setFetchErr("Cannot reach the backend server. Please check your connection.");
    }
    finally { setFetching(false); }
  }, [token]);

  // Initial fetch
  useEffect(() => { fetchDashboard(timeRange); }, [fetchDashboard]);

  // Re-fetch when time range changes
  useEffect(() => { fetchDashboard(timeRange); }, [timeRange]);

  // Re-fetch whenever the dashboard tab becomes visible (user navigates back to it)
  // Throttled: only re-fetch if it's been more than 30 seconds since last fetch
  useEffect(() => {
    if (!isActive) return;
    const now = Date.now();
    if (now - lastFetchRef.current > 30_000) {
      lastFetchRef.current = now;
      fetchDashboard(timeRange);
    }
  }, [isActive, fetchDashboard]);

  async function handleScanAccount(account) {
    setScanning(account.id);
    setScanErr(null);
    try {
      const res = await fetch(`${API}/accounts/${account.id}/scan`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        await fetchDashboard(timeRange);
        onScanComplete(result);
      } else {
        const d = await res.json().catch(() => ({}));
        setScanErr(d.detail || "Scan failed. Please try again.");
      }
    } catch {
      setScanErr("Cannot reach the backend server. Please check your connection.");
    }
    finally { setScanning(null); }
  }

  async function handleBulkScan() {
    setBulkScanning(true);
    setBulkToast(null);
    try {
      const res = await fetch(`${API}/accounts/scan-all`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
      });
      const d = await res.json();
      if (res.ok) {
        await fetchDashboard(timeRange);
        setBulkToast(`${d.success_count}/${d.results.length} accounts scanned successfully`
          + (d.fail_count > 0 ? ` · ${d.fail_count} failed` : ""));
      } else {
        setBulkToast(d.detail || "Bulk scan failed.");
      }
    } catch {
      setBulkToast("Cannot reach the backend server.");
    } finally {
      setBulkScanning(false);
      setTimeout(() => setBulkToast(null), 6000);
    }
  }

  async function handleStatus(f, status) {
    const key = `${f.rule_id}::${f.resource_id}`;
    try {
      const res = await fetch(`${API}/finding-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ finding_key: key, status }),
      });
      if (res.ok) {
        setStatuses(p => ({ ...p, [key]: status }));
      } else {
        setStatusMsg("Failed to update finding status. Please try again.");
        setTimeout(() => setStatusMsg(null), 4000);
      }
    } catch {
      setStatusMsg("Cannot reach the backend server.");
      setTimeout(() => setStatusMsg(null), 4000);
    }
  }

  function getStatus(f) {
    return statuses[`${f.rule_id}::${f.resource_id}`] || f.status || "open";
  }

  // ── Derived data ────────────────────────────────────────────────────────────
  const d = data || {};
  const accounts       = d.accounts        || [];
  const recentFindings = d.recent_findings  || [];
  const overallScore   = d.overall_score   ?? null;
  const totalAccounts  = d.total_accounts  ?? 0;
  const scannedAccounts = d.scanned_accounts ?? 0;
  const totalFindings  = d.total_findings  ?? 0;
  const totalCritical  = d.total_critical  ?? 0;
  const totalHigh      = d.total_high      ?? 0;

  // Compute medium/low from account finding_counts
  const totalMedium = accounts.reduce((s, a) => s + (a.finding_counts?.medium || 0), 0);
  const totalLow    = accounts.reduce((s, a) => s + (a.finding_counts?.low    || 0), 0);

  // Severity donut data
  const sevData = [
    { name: "CRITICAL", value: totalCritical, color: SEV_COLOR.CRITICAL },
    { name: "HIGH",     value: totalHigh,     color: SEV_COLOR.HIGH     },
    { name: "MEDIUM",   value: totalMedium,   color: SEV_COLOR.MEDIUM   },
    { name: "LOW",      value: totalLow,      color: SEV_COLOR.LOW      },
  ].filter(x => x.value > 0);

  // Account scores bar data
  const scoreBarData = accounts
    .filter(a => a.latest_score != null)
    .map(a => ({ name: a.name.length > 14 ? a.name.slice(0, 13) + "…" : a.name,
                 score: a.latest_score, fill: scoreColor(a.latest_score) }));

  // Top affected services
  const svcMap = {};
  recentFindings.forEach(f => {
    const svc = serviceLabel(f.rule_id);
    svcMap[svc] = (svcMap[svc] || 0) + 1;
  });
  const topServices = Object.entries(svcMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Filtered findings
  const filteredFindings = recentFindings.filter(f => {
    if (sevFilter !== "ALL" && f.severity !== sevFilter) return false;
    if (statusFilter !== "ALL") {
      const fStatus = statuses[`${f.rule_id}::${f.resource_id}`] || f.status || "open";
      if (fStatus !== statusFilter) return false;
    }
    if (findingSearch) {
      const q = findingSearch.toLowerCase();
      return (f.rule_id || "").toLowerCase().includes(q)
          || (f.resource_name || "").toLowerCase().includes(q)
          || (f.message || "").toLowerCase().includes(q)
          || (f.account_name || "").toLowerCase().includes(q);
    }
    return true;
  });

  const SEV_FILTERS = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

  return (
    <div style={{ padding: "28px 32px", maxWidth: "1300px", margin: "0 auto",
                  animation: "fadeIn 0.3s ease" }}>

      {/* ── Bulk scan toast ── */}
      {bulkToast && (
        <div style={{
          position: "fixed", bottom: "64px", right: "24px", zIndex: 999,
          padding: "12px 20px", borderRadius: "8px",
          background: "rgba(255,230,0,0.08)", border: "1px solid rgba(255,230,0,0.25)",
          color: "var(--cyan)", fontFamily: "var(--font-mono)", fontSize: "12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          ✓ {bulkToast}
        </div>
      )}

      {/* ── Status toast ── */}
      {statusMsg && (
        <div style={{
          position: "fixed", bottom: "24px", right: "24px", zIndex: 999,
          padding: "12px 20px", borderRadius: "8px",
          background: "rgba(224,85,85,0.12)", border: "1px solid rgba(224,85,85,0.3)",
          color: "#e05555", fontFamily: "var(--font-mono)", fontSize: "12px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          ⚠ {statusMsg}
        </div>
      )}

      {/* ── Header ── */}
      <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", marginBottom: "24px" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "20px",
                       fontWeight: 700, color: "var(--accent)",
                       letterSpacing: "0.05em", margin: 0 }}>DASHBOARD</h1>
          <p style={{ color: "var(--accent3)", fontSize: "12px", marginTop: "4px",
                      fontFamily: "var(--font-mono)",
                      display: "flex", alignItems: "center", gap: "8px" }}>
            {fetching
              ? <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span style={{ width: "9px", height: "9px",
                                 border: "1.5px solid var(--border)",
                                 borderTop: "1.5px solid var(--cyan)",
                                 borderRadius: "50%",
                                 animation: "spin 0.7s linear infinite",
                                 display: "inline-block" }} />
                  LOADING...
                </span>
              : `${scannedAccounts}/${totalAccounts} accounts scanned · ${totalFindings} total findings`}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {[["all","ALL"],["7","7D"],["30","30D"],["90","90D"]].map(([v, l]) => (
            <button key={v} onClick={() => setTimeRange(v)} style={{
              padding: "6px 10px", borderRadius: 5, fontSize: 10,
              fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.08em",
              cursor: "pointer", border: "1px solid var(--border)",
              background: timeRange === v ? "rgba(255,230,0,0.12)" : "transparent",
              color: timeRange === v ? "var(--cyan)" : "var(--accent3)",
              transition: "all 0.15s",
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── Error banners ── */}
      {fetchErr && (
        <div style={{
          marginBottom: "16px", padding: "12px 16px",
          background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.25)",
          borderRadius: "8px", color: "#e05555",
          fontFamily: "var(--font-mono)", fontSize: "12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "16px" }}>⚠</span>
          {fetchErr}
        </div>
      )}
      {scanErr && (
        <div style={{
          marginBottom: "16px", padding: "12px 16px",
          background: "rgba(224,85,85,0.08)", border: "1px solid rgba(224,85,85,0.25)",
          borderRadius: "8px", color: "#e05555",
          fontFamily: "var(--font-mono)", fontSize: "12px",
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <span style={{ fontSize: "16px" }}>⚠</span>
          {scanErr}
          <button onClick={() => setScanErr(null)} style={{
            marginLeft: "auto", background: "transparent", border: "none",
            color: "#e05555", cursor: "pointer", fontSize: "14px",
          }}>✕</button>
        </div>
      )}

      {/* ── Stat Cards ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)",
                    gap: "12px", marginBottom: "20px" }}>
        <StatCard label="SECURITY SCORE" value={overallScore}
                  color={scoreColor(overallScore)} sub={scoreLabel(overallScore)}
                  bar={overallScore} />
        <StatCard label="ACCOUNTS" value={totalAccounts}
                  sub={`${scannedAccounts} scanned`} />
        <StatCard label="CRITICAL" value={totalCritical}
                  color={totalCritical > 0 ? SEV_COLOR.CRITICAL : "#39ff14"} />
        <StatCard label="HIGH" value={totalHigh}
                  color={totalHigh > 0 ? SEV_COLOR.HIGH : "#39ff14"} />
        <StatCard label="TOTAL FINDINGS" value={totalFindings}
                  sub={`${totalMedium} med · ${totalLow} low`} />
      </div>

      {/* ── Charts Row ── */}
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr",
                    gap: "16px", marginBottom: "16px" }}>

        {/* Severity Donut */}
        <Card>
          <CardHeader title="FINDINGS BY SEVERITY" />
          <div style={{ padding: "16px 0 8px", position: "relative" }}>
            {sevData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={sevData} cx="50%" cy="50%"
                         innerRadius={60} outerRadius={88}
                         paddingAngle={3} dataKey="value"
                         strokeWidth={0}>
                      {sevData.map((entry, i) => (
                        <Cell key={i} fill={entry.color}
                              style={{ filter: `drop-shadow(0 0 5px ${entry.color}88)` }} />
                      ))}
                    </Pie>
                    <DonutCenter cx={0} cy={0} score={overallScore} />
                    <Tooltip {...tooltipStyle}
                      formatter={(v, n) => [`${v} findings`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Legend */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px",
                              padding: "0 16px 12px", justifyContent: "center" }}>
                  {sevData.map(s => (
                    <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%",
                                    background: s.color,
                                    boxShadow: `0 0 5px ${s.color}` }} />
                      <span style={{ color: "var(--accent2)", fontSize: "10px",
                                     fontFamily: "var(--font-ui)", letterSpacing: "0.06em" }}>
                        {s.name} <span style={{ color: s.color }}>{s.value}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptySlot icon="◎" text="No findings data" height={220}
                         sub="Run a scan to see severity breakdown" />
            )}
          </div>
        </Card>

        {/* Account Score Comparison */}
        <Card>
          <CardHeader title="ACCOUNT SECURITY SCORES" right="0 – 100" />
          <div style={{ padding: "16px 16px 8px" }}>
            {scoreBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={scoreBarData} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"
                                 vertical={false} />
                  <XAxis dataKey="name"
                    tick={{ fill: "#606068", fontSize: 10, fontFamily: "var(--font-ui)" }}
                    axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]}
                    tick={{ fill: "#606068", fontSize: 10 }}
                    axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle}
                    formatter={(v) => [`${v}`, "Score"]} />
                  <Bar dataKey="score" radius={[4,4,0,0]} maxBarSize={52}>
                    {scoreBarData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill}
                            style={{ filter: `drop-shadow(0 0 4px ${entry.fill}66)` }} />
                    ))}
                    <LabelList dataKey="score" position="top"
                      style={{ fill: "#8a8070", fontSize: 10, fontFamily: "var(--font-ui)" }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptySlot icon="▦" text="No account scores yet" height={220}
                         sub="Scan accounts to compare security posture" />
            )}
          </div>
        </Card>
      </div>

      {/* ── Top Affected Services ── */}
      <Card style={{ marginBottom: "16px" }}>
        <CardHeader title="TOP AFFECTED SERVICES"
                    right={topServices.length > 0 ? `${topServices.length} services` : undefined} />
        <div style={{ padding: "16px 16px 8px" }}>
          {topServices.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={topServices} layout="vertical"
                        margin={{ top: 0, right: 40, bottom: 0, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)"
                               horizontal={false} />
                <XAxis type="number" tick={{ fill: "#606068", fontSize: 10 }}
                       axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={80}
                       tick={{ fill: "#8a8070", fontSize: 11, fontFamily: "var(--font-ui)" }}
                       axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle}
                  formatter={(v) => [`${v} findings`, "Count"]} />
                <Bar dataKey="count" fill="#ffe600" radius={[0,4,4,0]} maxBarSize={18}
                     style={{ filter: "drop-shadow(0 0 4px rgba(255,230,0,0.3))" }}>
                  <LabelList dataKey="count" position="right"
                    style={{ fill: "#ffe600", fontSize: 10, fontFamily: "var(--font-display)" }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptySlot icon="⬡" text="No service data yet" height={120}
                       sub="Findings will be grouped by cloud service after a scan" />
          )}
        </div>
      </Card>

      {/* ── Category Metrics ── */}
      {accounts.length > 0 && (() => {
        const CAT_COLORS = {
          Production:  { color: "#e05555", border: "rgba(224,85,85,0.3)",  bg: "rgba(224,85,85,0.06)"  },
          Staging:     { color: "#d97b3a", border: "rgba(217,123,58,0.3)", bg: "rgba(217,123,58,0.06)" },
          Development: { color: "#7b8cde", border: "rgba(123,140,222,0.3)",bg: "rgba(123,140,222,0.06)"},
          Testing:     { color: "#c9a84c", border: "rgba(201,168,76,0.3)", bg: "rgba(201,168,76,0.06)" },
          Sandbox:     { color: "#4caf7d", border: "rgba(76,175,125,0.3)", bg: "rgba(76,175,125,0.06)" },
          General:     { color: "#8899aa", border: "rgba(136,153,170,0.3)",bg: "rgba(136,153,170,0.06)"},
        };
        function catStyle(cat) { return CAT_COLORS[cat] || CAT_COLORS.General; }
        function scoreCol(s) {
          if (s == null) return "var(--accent3)";
          if (s >= 80) return "#4caf7d";
          if (s >= 60) return "#c9a84c";
          if (s >= 40) return "#d97b3a";
          return "#e05555";
        }

        // Build category groups from accounts
        const grouped = {};
        accounts.forEach(a => {
          const cat = a.category || "General";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(a);
        });
        const ORDER = ["Production","Staging","Development","Testing","Sandbox","General"];
        const cats = [
          ...ORDER.filter(c => grouped[c]),
          ...Object.keys(grouped).filter(c => !ORDER.includes(c)),
        ];

        if (cats.length <= 1) return null; // no point showing if only 1 category

        return (
          <Card style={{ marginBottom: "16px" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)",
                             fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em" }}>
                CATEGORY METRICS
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(cats.length, 3)}, 1fr)`, gap: 1, background: "var(--border)" }}>
              {cats.map(cat => {
                const accs   = grouped[cat];
                const s      = catStyle(cat);
                const scanned = accs.filter(a => a.latest_score != null);
                const avgScore = scanned.length
                  ? Math.round(scanned.reduce((s, a) => s + a.latest_score, 0) / scanned.length)
                  : null;
                const crit = accs.reduce((s, a) => s + (a.finding_counts?.critical || 0), 0);
                const high = accs.reduce((s, a) => s + (a.finding_counts?.high    || 0), 0);
                const med  = accs.reduce((s, a) => s + (a.finding_counts?.medium  || 0), 0);
                const low  = accs.reduce((s, a) => s + (a.finding_counts?.low     || 0), 0);
                return (
                  <div key={cat} style={{ padding: "18px 20px", background: "var(--surface)", borderLeft: `3px solid ${s.color}` }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700,
                                      color: s.color, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 2 }}>
                          {cat}
                        </div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--accent3)" }}>
                          {accs.length} account{accs.length !== 1 ? "s" : ""}
                          {scanned.length < accs.length ? ` · ${accs.length - scanned.length} unscanned` : ""}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800,
                                      lineHeight: 1, color: scoreCol(avgScore) }}>
                          {avgScore != null ? avgScore : "—"}
                        </div>
                        <div style={{ fontFamily: "var(--font-ui)", fontSize: 9, letterSpacing: "0.08em",
                                      color: scoreCol(avgScore) }}>
                          {avgScore != null ? (avgScore >= 80 ? "LOW RISK" : avgScore >= 60 ? "MED RISK" : avgScore >= 40 ? "HIGH RISK" : "CRITICAL") : "NO DATA"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
                      {[["CRIT", crit, SEV_COLOR.CRITICAL], ["HIGH", high, SEV_COLOR.HIGH],
                        ["MED",  med,  SEV_COLOR.MEDIUM],  ["LOW",  low,  SEV_COLOR.LOW]].map(([lbl, val, col]) => (
                        <div key={lbl} style={{ textAlign: "center", padding: "6px 4px", borderRadius: 5,
                                                background: "var(--card)", border: "1px solid var(--border)" }}>
                          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 800,
                                        color: val > 0 ? col : "var(--accent3)", lineHeight: 1 }}>{val}</div>
                          <div style={{ fontFamily: "var(--font-ui)", fontSize: 8, color: col,
                                        letterSpacing: "0.1em", marginTop: 2 }}>{lbl}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })()}

      {/* ── Account Health Table ── */}
      <Card style={{ marginBottom: "16px" }}>
        <div style={{
          padding: "14px 20px", borderBottom: "1px solid var(--border)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)",
                         fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em" }}>
            ACCOUNT HEALTH
          </span>
          {canScan && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleBulkScan} disabled={bulkScanning} className="neon-btn" style={{
                padding: "5px 12px", background: bulkScanning ? "rgba(255,230,0,0.05)" : "transparent",
                border: "1px solid rgba(255,230,0,0.25)", borderRadius: "5px",
                color: bulkScanning ? "var(--accent3)" : "var(--cyan)", fontFamily: "var(--font-ui)",
                fontSize: "11px", fontWeight: 600,
                cursor: bulkScanning ? "not-allowed" : "pointer",
                letterSpacing: "0.08em", opacity: bulkScanning ? 0.6 : 1,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                {bulkScanning && <span style={{ width: 9, height: 9, border: "1.5px solid var(--border)",
                  borderTop: "1.5px solid var(--accent3)", borderRadius: "50%",
                  animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
                {bulkScanning ? "SCANNING..." : "⟳ SCAN ALL"}
              </button>
              <button onClick={() => onNavigate("accounts")} className="neon-btn" style={{
                padding: "5px 12px", background: "transparent",
                border: "1px solid rgba(255,230,0,0.25)", borderRadius: "5px",
                color: "var(--cyan)", fontFamily: "var(--font-ui)",
                fontSize: "11px", fontWeight: 600, cursor: "pointer", letterSpacing: "0.08em",
              }}>+ ADD ACCOUNT</button>
            </div>
          )}
        </div>

        {accounts.length > 0 ? (
          <>
            <div style={{
              display: "grid",
              gridTemplateColumns: "28px 1fr 120px 60px 60px 60px 60px 110px",
              gap: "12px", padding: "9px 20px",
              background: "var(--surface)", borderBottom: "1px solid var(--border)",
              fontSize: "9px", color: "var(--accent3)", letterSpacing: "0.1em",
              fontFamily: "var(--font-ui)", fontWeight: 600,
            }}>
              <span /><span>ACCOUNT</span>
              <span>SCORE</span>
              <span style={{ textAlign: "center", color: SEV_COLOR.CRITICAL }}>CRIT</span>
              <span style={{ textAlign: "center", color: SEV_COLOR.HIGH }}>HIGH</span>
              <span style={{ textAlign: "center", color: SEV_COLOR.MEDIUM }}>MED</span>
              <span style={{ textAlign: "center", color: SEV_COLOR.LOW }}>LOW</span>
              <span />
            </div>
            {accounts.map(account => (
              <AccountRow key={account.id}
                account={scanning === account.id
                  ? { ...account, name: `${account.name} — scanning...` }
                  : account}
                onScanClick={handleScanAccount}
                canScan={canScan} />
            ))}
          </>
        ) : (
          <EmptySlot icon="☁" text="No cloud accounts connected"
                     sub="Use the button above to add your first AWS or Azure account" />
        )}
      </Card>

      {/* ── Recent Findings with severity filter ── */}
      <Card>
        {/* Header + filter tabs */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--border)",
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-display)",
                         fontSize: "13px", fontWeight: 700, letterSpacing: "0.07em" }}>
            RECENT FINDINGS
          </span>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={findingSearch}
              onChange={e => setFindingSearch(e.target.value)}
              placeholder="Search..."
              style={{
                background: "var(--surface)", border: "1px solid var(--border)",
                borderRadius: 5, padding: "4px 10px", color: "var(--accent)",
                fontFamily: "var(--font-mono)", fontSize: 11, width: 140,
              }}
            />
            <div style={{ display: "flex", gap: 4 }}>
              {["ALL","open","acknowledged","resolved"].map(s => {
                const active = statusFilter === s;
                return (
                  <button key={s} onClick={() => setStatusFilter(s)} style={{
                    padding: "3px 8px", borderRadius: 4, cursor: "pointer",
                    fontFamily: "var(--font-ui)", fontSize: "9px", fontWeight: 700,
                    letterSpacing: "0.07em", border: "1px solid",
                    background: active ? "rgba(255,230,0,0.08)" : "transparent",
                    color: active ? "var(--cyan)" : "var(--accent3)",
                    borderColor: active ? "rgba(255,230,0,0.3)" : "var(--border)",
                    textTransform: "uppercase",
                  }}>{s}</button>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {SEV_FILTERS.map(f => {
                const active = sevFilter === f;
                const col = f === "ALL" ? "var(--cyan)" : SEV_COLOR[f];
                return (
                  <button key={f} onClick={() => setSevFilter(f)} style={{
                    padding: "3px 10px", borderRadius: "4px", cursor: "pointer",
                    fontFamily: "var(--font-ui)", fontSize: "10px", fontWeight: 700,
                    letterSpacing: "0.07em", border: "1px solid",
                    background: active ? (f === "ALL" ? "rgba(255,230,0,0.1)" : col + "18") : "transparent",
                    color: active ? col : "var(--accent3)",
                    borderColor: active ? col : "var(--border)",
                    transition: "all 0.15s",
                  }}>{f}</button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Column headers */}
        {filteredFindings.length > 0 && (
          <div style={{
            display: "grid", gridTemplateColumns: "72px 120px 120px 1fr 90px 130px",
            gap: "12px", padding: "8px 20px",
            background: "var(--surface)", borderBottom: "1px solid var(--border)",
            fontSize: "9px", color: "var(--accent3)", letterSpacing: "0.1em",
            fontFamily: "var(--font-ui)", fontWeight: 600,
          }}>
            <span>SEVERITY</span><span>RULE</span><span>ACCOUNT</span>
            <span>RESOURCE / MESSAGE</span><span>STATUS</span>
            <span style={{ textAlign: "right" }}>SCANNED</span>
          </div>
        )}

        {filteredFindings.length > 0 ? filteredFindings.map((f, i) => {
          const status = getStatus(f);
          const isExp  = expanded === i;
          return (
          <div key={i} style={{
            borderBottom: i < filteredFindings.length - 1 ? "1px solid var(--border)" : "none",
            background: i % 2 === 0 ? "transparent" : "rgba(0,0,0,0.1)",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "72px 120px 120px 1fr 90px 130px",
              gap: "12px", alignItems: "center",
              padding: "10px 20px", cursor: "pointer",
              transition: "background 0.12s",
            }}
            onClick={() => setExpanded(isExp ? null : i)}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,230,0,0.03)"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}>

              <span style={{
                fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
                color: SEV_COLOR[f.severity], fontFamily: "var(--font-ui)",
                background: SEV_COLOR[f.severity] + "18",
                padding: "3px 7px", borderRadius: "3px",
                border: `1px solid ${SEV_COLOR[f.severity]}33`,
                whiteSpace: "nowrap",
              }}>{f.severity}</span>

              <span style={{ fontFamily: "var(--font-mono)", fontSize: "10px",
                             color: "var(--accent2)", overflow: "hidden",
                             textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {f.rule_id}
              </span>

              <span style={{
                fontSize: "11px", color: "var(--accent3)",
                background: "var(--surface)", padding: "2px 7px",
                borderRadius: "3px", fontFamily: "var(--font-ui)",
                border: "1px solid var(--border)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>{f.account_name}</span>

              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--accent)", fontSize: "12px", fontWeight: 500,
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {f.resource_name}
                </div>
                <div style={{ color: "var(--accent3)", fontSize: "10px",
                              fontFamily: "var(--font-mono)", marginTop: "2px",
                              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(f.message || "").slice(0, 80)}{(f.message || "").length > 80 ? "…" : ""}
                </div>
              </div>

              <span style={{
                fontSize: "10px", fontWeight: 600, letterSpacing: "0.06em",
                color: status === "resolved"     ? "#39ff14"
                     : status === "acknowledged" ? "#ffe600"
                     : "var(--accent3)",
                fontFamily: "var(--font-ui)", textTransform: "uppercase",
              }}>{status}</span>

              <span style={{ color: "var(--accent3)", fontSize: "10px",
                             fontFamily: "var(--font-mono)", textAlign: "right",
                             whiteSpace: "nowrap" }}>
                {f.scanned_at}
              </span>
            </div>

            {isExp && (
              <div style={{
                padding: "0 20px 16px",
                borderTop: "1px solid var(--border)",
                background: "rgba(0,0,0,0.2)",
              }}>
                <div style={{
                  paddingTop: "14px", display: "grid",
                  gridTemplateColumns: "1fr 1fr", gap: "16px",
                }}>
                  <div>
                    <div style={{
                      color: "var(--accent3)", fontSize: "10px",
                      letterSpacing: "0.1em", marginBottom: "5px",
                      fontFamily: "var(--font-ui)",
                    }}>FINDING DETAIL</div>
                    <p style={{
                      color: "var(--accent2)", fontSize: "12px",
                      fontFamily: "var(--font-mono)", lineHeight: 1.6, margin: 0,
                    }}>{f.message}</p>
                  </div>
                  <div>
                    <div style={{
                      color: "var(--accent3)", fontSize: "10px",
                      letterSpacing: "0.1em", marginBottom: "5px",
                      fontFamily: "var(--font-ui)",
                    }}>REMEDIATION</div>
                    <p style={{
                      color: "var(--accent)", fontSize: "12px",
                      fontFamily: "var(--font-mono)", lineHeight: 1.6, margin: 0,
                    }}>{f.remediation || "No remediation guidance available."}</p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
                      <button onClick={(e) => { e.stopPropagation(); handleStatus(f, "resolved"); }} style={{
                        padding: "5px 12px", border: "1px solid #39ff14",
                        borderRadius: "4px", background: "transparent",
                        color: "#39ff14", cursor: "pointer",
                        fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600,
                      }}>MARK RESOLVED</button>
                      <button onClick={(e) => { e.stopPropagation(); handleStatus(f, "acknowledged"); }} style={{
                        padding: "5px 12px", border: "1px solid #ffe600",
                        borderRadius: "4px", background: "transparent",
                        color: "#ffe600", cursor: "pointer",
                        fontFamily: "var(--font-ui)", fontSize: "11px", fontWeight: 600,
                      }}>ACKNOWLEDGE</button>
                      <button onClick={(e) => { e.stopPropagation(); handleStatus(f, "open"); }} style={{
                        padding: "5px 12px", border: "1px solid var(--border)",
                        borderRadius: "4px", background: "transparent",
                        color: "var(--accent3)", cursor: "pointer",
                        fontFamily: "var(--font-ui)", fontSize: "11px",
                      }}>REOPEN</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        }) : (
          <EmptySlot icon="🛡"
            text={recentFindings.length === 0 ? "No findings yet" : "No matching findings"}
            sub={recentFindings.length === 0 ? "Run a scan to check your cloud security posture" : "Try a different filter or search term"} />
        )}
      </Card>

    </div>
  );
}
