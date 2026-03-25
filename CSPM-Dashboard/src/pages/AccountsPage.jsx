import { useState, useEffect } from "react";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

const CATEGORIES = ["Production", "Development", "Staging", "Testing", "Sandbox", "General"];

const CATEGORY_COLORS = {
  Production: { color: "#e05555", bg: "rgba(224,85,85,0.1)",   border: "rgba(224,85,85,0.3)" },
  Staging:    { color: "#d97b3a", bg: "rgba(217,123,58,0.1)",  border: "rgba(217,123,58,0.3)" },
  Development:{ color: "#7b8cde", bg: "rgba(123,140,222,0.1)", border: "rgba(123,140,222,0.3)" },
  Testing:    { color: "#c9a84c", bg: "rgba(201,168,76,0.1)",  border: "rgba(201,168,76,0.3)" },
  Sandbox:    { color: "#4caf7d", bg: "rgba(76,175,125,0.1)",  border: "rgba(76,175,125,0.3)" },
  General:    { color: "#8899aa", bg: "rgba(136,153,170,0.1)", border: "rgba(136,153,170,0.3)" },
};

function getCategoryStyle(cat) {
  return CATEGORY_COLORS[cat] || CATEGORY_COLORS.General;
}

function CategoryBadge({ category }) {
  const s = getCategoryStyle(category);
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 9, fontWeight: 700,
      fontFamily: "var(--font-ui)", letterSpacing: "0.1em", textTransform: "uppercase",
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
    }}>{category || "General"}</span>
  );
}

function CategoryPicker({ value, onChange }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={labelStyle}>CATEGORY</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {CATEGORIES.map(c => {
          const s = getCategoryStyle(c);
          const sel = value === c;
          return (
            <button key={c} onClick={() => onChange(c)} style={{
              padding: "5px 12px", borderRadius: 5, cursor: "pointer", fontSize: 10,
              fontFamily: "var(--font-ui)", fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", transition: "all 0.15s",
              border: `1px solid ${sel ? s.border : "var(--border)"}`,
              background: sel ? s.bg : "transparent",
              color: sel ? s.color : "var(--accent3)",
            }}>{c}</button>
          );
        })}
      </div>
    </div>
  );
}

function scoreColor(s) {
  if (s >= 80) return "#4caf7d";
  if (s >= 60) return "#c9a84c";
  if (s >= 40) return "#d97b3a";
  return "#e05555";
}
function scoreLabel(s) {
  if (s >= 80) return "LOW RISK";
  if (s >= 60) return "MED RISK";
  if (s >= 40) return "HIGH RISK";
  return "CRITICAL";
}

const inputStyle = {
  width: "100%", background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: "6px", padding: "9px 12px", color: "var(--accent)",
  fontFamily: "var(--font-mono)", fontSize: "13px", boxSizing: "border-box",
};
const labelStyle = {
  display: "block", color: "var(--accent3)", fontSize: "11px",
  letterSpacing: "0.1em", marginBottom: "5px",
  fontFamily: "var(--font-ui)", fontWeight: 600,
};

function Field({ label, type = "text", placeholder, value, onChange }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} placeholder={placeholder} value={value}
        onChange={e => onChange(e.target.value)} style={inputStyle} autoComplete="off" />
    </div>
  );
}

// ── 3-Dot Menu ───────────────────────────────────────────────────────────────
function ThreeDotMenu({ onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: "transparent", border: "none", cursor: "pointer",
          color: "var(--accent3)", fontSize: "20px", lineHeight: 1,
          padding: "0 6px", borderRadius: "4px", transition: "color 0.15s" }}
        onMouseEnter={e => e.target.style.color = "var(--accent)"}
        onMouseLeave={e => e.target.style.color = "var(--accent3)"}
      >⋯</button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 10 }}
               onClick={() => setOpen(false)} />
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: "8px", overflow: "hidden", zIndex: 20,
            minWidth: "140px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}>
            <button onClick={() => { setOpen(false); onEdit(); }} style={{
              display: "block", width: "100%", padding: "10px 16px",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--accent2)", fontFamily: "var(--font-ui)",
              fontSize: "12px", fontWeight: 600, textAlign: "left",
              letterSpacing: "0.06em",
            }}
            onMouseEnter={e => e.target.style.background = "rgba(255,255,255,0.05)"}
            onMouseLeave={e => e.target.style.background = "transparent"}
            >✎ EDIT</button>
            <div style={{ height: "1px", background: "var(--border)" }} />
            <button onClick={() => { setOpen(false); onDelete(); }} style={{
              display: "block", width: "100%", padding: "10px 16px",
              background: "transparent", border: "none", cursor: "pointer",
              color: "var(--red)", fontFamily: "var(--font-ui)",
              fontSize: "12px", fontWeight: 600, textAlign: "left",
              letterSpacing: "0.06em",
            }}
            onMouseEnter={e => e.target.style.background = "rgba(224,85,85,0.08)"}
            onMouseLeave={e => e.target.style.background = "transparent"}
            >✕ DELETE</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Add Account Modal ─────────────────────────────────────────────────────────
function AddAccountModal({ token, onClose, onAdded }) {
  const [cloud,    setCloud]    = useState("aws");
  const [name,     setName]     = useState("");
  const [category, setCategory] = useState("General");
  const [interval,     setInterval]     = useState(24);
  const [intervalMode, setIntervalMode] = useState("preset");
  const [customHours,  setCustomHours]  = useState(1);
  const [customUnit,   setCustomUnit]   = useState("hours");
  const [keyId,    setKeyId]    = useState("");
  const [secret,   setSecret]   = useState("");
  const [region,   setRegion]   = useState("");
  const [subId,    setSubId]    = useState("");
  const [tenant,   setTenant]   = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSec,setClientSec]= useState("");
  const [testing, setTesting] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [testMsg, setTestMsg] = useState(null);
  const [error,   setError]   = useState(null);

  function buildPayload() {
    const eff = intervalMode === "continuous" ? 0.25
      : intervalMode === "custom"
        ? (customUnit === "minutes" ? customHours / 60
         : customUnit === "days"    ? customHours * 24
         : customHours) : interval;
    const base = { name, cloud, category, scan_interval_hours: eff };
    if (cloud === "aws") return { ...base, access_key_id: keyId, secret_access_key: secret, region };
    return { ...base, subscription_id: subId, tenant_id: tenant, client_id: clientId, client_secret: clientSec };
  }

  async function handleTest() {
    setTesting(true); setTestMsg(null); setError(null);
    const creds = cloud === "aws"
      ? { cloud, aws: { access_key_id: keyId, secret_access_key: secret, region } }
      : { cloud, azure: { subscription_id: subId, tenant_id: tenant, client_id: clientId, client_secret: clientSec } };
    try {
      const res  = await fetch(`${API}/test-connection`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(creds),
      });
      const data = await res.json();
      if (res.ok) setTestMsg({ ok: true, msg: "Connection successful ✓" });
      else {
        const detail = data.detail;
        const msg = typeof detail === "object" && detail !== null
          ? Object.entries(detail).map(([k, v]) => `${k.toUpperCase()}: ${v}`).join(" | ")
          : String(detail || "Connection test failed.");
        setTestMsg({ ok: false, msg });
      }
    } catch { setTestMsg({ ok: false, msg: "Unable to connect. Please check your credentials." }); }
    finally { setTesting(false); }
  }

  async function handleSave() {
    if (!name.trim()) { setError("Account name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res  = await fetch(`${API}/accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();
      if (res.ok) { onAdded(data.account); onClose(); }
      else setError(data.detail || "Failed to save. Please try again.");
    } catch { setError("Cannot reach API."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:"12px", padding:"32px", width:"500px", maxHeight:"90vh", overflowY:"auto" }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"24px" }}>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:"18px", fontWeight:700,
            color:"var(--accent)", letterSpacing:"0.05em", margin:0 }}>ADD CLOUD ACCOUNT</h2>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:"var(--accent3)", fontSize:"20px", cursor:"pointer" }}>×</button>
        </div>

        <Field label="ACCOUNT NAME *" placeholder='e.g. "Production AWS"' value={name} onChange={setName} />

        <CategoryPicker value={category} onChange={setCategory} />

        <div style={{ marginBottom:"20px" }}>
          <label style={labelStyle}>CLOUD PROVIDER</label>
          <div style={{ display:"flex", background:"var(--card)", border:"1px solid var(--border)",
            borderRadius:"6px", overflow:"hidden" }}>
            {["aws","azure"].map(c => (
              <button key={c} onClick={() => { setCloud(c); setTestMsg(null); }} style={{
                flex:1, padding:"9px", border:"none", cursor:"pointer",
                background: cloud===c ? "rgba(255,230,0,0.1)" : "transparent",
                color:      cloud===c ? "var(--cyan)"         : "var(--accent3)",
                fontFamily:"var(--font-ui)", fontWeight:700, fontSize:"12px",
                letterSpacing:"0.1em", textTransform:"uppercase",
                borderBottom: cloud===c ? "2px solid var(--cyan)" : "2px solid transparent",
                textShadow: cloud===c ? "0 0 8px rgba(255,230,0,0.5)" : "none",
              }}>{c}</button>
            ))}
          </div>
        </div>

        {cloud === "aws" && <>
          <Field label="ACCESS KEY ID *"     placeholder="AKIA..." value={keyId}   onChange={setKeyId} />
          <Field label="SECRET ACCESS KEY *" type="password"
            placeholder="••••••••••••••••••••••••••••••••••••••" value={secret} onChange={setSecret} />
          <Field label="REGION" placeholder="e.g. us-east-1 (optional)" value={region} onChange={setRegion} />
        </>}
        {cloud === "azure" && <>
          <Field label="SUBSCRIPTION ID *" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={subId}     onChange={setSubId} />
          <Field label="TENANT ID *"       placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={tenant}    onChange={setTenant} />
          <Field label="CLIENT ID *"       placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={clientId}  onChange={setClientId} />
          <Field label="CLIENT SECRET *"   type="password"
            placeholder="••••••••••••••••••••••••••••••••" value={clientSec} onChange={setClientSec} />
        </>}

        <div style={{ marginBottom:"20px" }}>
          <label style={labelStyle}>AUTO-SCAN INTERVAL</label>
          <div style={{ display:"flex", background:"var(--bg)", border:"1px solid var(--border)",
            borderRadius:"6px", overflow:"hidden", marginBottom:"10px" }}>
            {[{id:"preset",label:"PRESET"},{id:"custom",label:"CUSTOM"},{id:"continuous",label:"CONTINUOUS"}].map(m => (
              <button key={m.id} onClick={() => setIntervalMode(m.id)} style={{
                flex:1, padding:"7px 0", border:"none", cursor:"pointer",
                background: intervalMode===m.id ? "rgba(255,230,0,0.1)" : "transparent",
                color:      intervalMode===m.id ? "var(--cyan)"         : "var(--accent3)",
                fontFamily:"var(--font-ui)", fontWeight:700, fontSize:"11px",
                letterSpacing:"0.08em", transition:"all 0.15s",
                borderBottom: intervalMode===m.id ? "2px solid var(--cyan)" : "2px solid transparent",
              }}>{m.label}</button>
            ))}
          </div>
          {intervalMode === "preset" && (
            <select value={interval} onChange={e => setInterval(Number(e.target.value))}
              style={{ ...inputStyle, cursor:"pointer" }}>
              <option value={0}>Manual only</option>
              <option value={1}>Every hour</option>
              <option value={3}>Every 3 hours</option>
              <option value={6}>Every 6 hours</option>
              <option value={12}>Every 12 hours</option>
              <option value={24}>Every 24 hours</option>
              <option value={48}>Every 48 hours</option>
              <option value={72}>Every 3 days</option>
              <option value={168}>Weekly</option>
            </select>
          )}
          {intervalMode === "custom" && (
            <div style={{ display:"flex", gap:"8px" }}>
              <input type="number" min="1" max="999" value={customHours}
                onChange={e => setCustomHours(Math.max(1, Number(e.target.value)))}
                style={{ ...inputStyle, width:"80px" }} />
              <select value={customUnit} onChange={e => setCustomUnit(e.target.value)}
                style={{ ...inputStyle, flex:1, cursor:"pointer" }}>
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
                <option value="days">Days</option>
              </select>
            </div>
          )}
          {intervalMode === "continuous" && (
            <div style={{ padding:"12px 14px", borderRadius:"6px",
              background:"rgba(76,175,125,0.08)", border:"1px solid rgba(76,175,125,0.25)" }}>
              <div style={{ color:"var(--green)", fontSize:"12px", fontFamily:"var(--font-ui)",
                fontWeight:700, marginBottom:"4px" }}>● CONTINUOUS MONITORING</div>
              <div style={{ color:"var(--accent3)", fontSize:"11px",
                fontFamily:"var(--font-mono)", lineHeight:1.5 }}>
                Scans every 15 minutes around the clock.
              </div>
            </div>
          )}
        </div>

        {testMsg && (
          <div style={{ padding:"9px 12px", borderRadius:"6px", marginBottom:"14px",
            background: testMsg.ok ? "rgba(76,175,125,0.1)" : "rgba(224,85,85,0.1)",
            color:      testMsg.ok ? "var(--green)"         : "var(--red)",
            border: `1px solid ${testMsg.ok ? "rgba(76,175,125,0.3)" : "rgba(224,85,85,0.3)"}`,
            fontSize:"12px", fontFamily:"var(--font-mono)" }}>{testMsg.msg}</div>
        )}
        {error && (
          <div style={{ padding:"9px 12px", borderRadius:"6px", marginBottom:"14px",
            background:"rgba(224,85,85,0.1)", color:"var(--red)",
            border:"1px solid rgba(224,85,85,0.3)",
            fontSize:"12px", fontFamily:"var(--font-mono)" }}>{error}</div>
        )}
        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={handleTest} disabled={testing} style={{
            flex:1, padding:"10px", border:"1px solid var(--border)", borderRadius:"6px",
            background:"transparent", color:"var(--accent2)", fontFamily:"var(--font-ui)",
            fontWeight:600, fontSize:"13px", cursor: testing ? "not-allowed" : "pointer",
          }}>{testing ? "TESTING..." : "TEST"}</button>
          <button onClick={handleSave} disabled={saving} className="neon-btn" style={{
            flex:2, padding:"10px",
            border:`1px solid ${saving ? "rgba(255,230,0,0.2)" : "var(--cyan)"}`,
            borderRadius:"6px", background:"transparent",
            color: saving ? "rgba(255,230,0,0.4)" : "var(--cyan)",
            fontFamily:"var(--font-ui)", fontWeight:700, fontSize:"13px",
            cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "var(--glow-cyan)",
            textShadow: saving ? "none" : "0 0 6px rgba(255,230,0,0.5)",
          }}>{saving ? "SAVING..." : "SAVE ACCOUNT"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Account Modal ────────────────────────────────────────────────────────
function EditAccountModal({ account, token, onClose, onUpdated }) {
  const [name,     setName]     = useState(account.name);
  const [category, setCategory] = useState(account.category || "General");
  const [interval, setInterval] = useState(account.scan_interval_hours ?? 24);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState(null);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      const res = await fetch(`${API}/accounts/${account.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ name, category, scan_interval_hours: interval }),
      });
      const data = await res.json();
      if (res.ok) { onUpdated(data.account); onClose(); }
      else setError(data.detail || "Update failed.");
    } catch { setError("Cannot reach API."); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:300 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background:"var(--surface)", border:"1px solid var(--border)",
        borderRadius:"12px", padding:"28px", width:"420px" }}>
        <div style={{ display:"flex", justifyContent:"space-between",
          alignItems:"center", marginBottom:"20px" }}>
          <h2 style={{ fontFamily:"var(--font-display)", fontSize:"16px", fontWeight:700,
            color:"var(--accent)", letterSpacing:"0.05em", margin:0 }}>EDIT ACCOUNT</h2>
          <button onClick={onClose} style={{ background:"transparent", border:"none",
            color:"var(--accent3)", fontSize:"20px", cursor:"pointer" }}>×</button>
        </div>

        <div style={{ marginBottom:"16px", display:"flex", alignItems:"center", gap:"8px" }}>
          <span style={{ background: account.cloud==="aws" ? "#ff9900" : "#0089d6",
            color:"#000", fontSize:"9px", fontWeight:700, padding:"2px 6px",
            borderRadius:"3px", fontFamily:"var(--font-ui)" }}>
            {account.cloud.toUpperCase()}
          </span>
          <span style={{ color:"var(--accent3)", fontSize:"12px", fontFamily:"var(--font-mono)" }}>
            {account.region || "—"} · credentials cannot be changed
          </span>
        </div>

        <Field label="ACCOUNT NAME" placeholder="Production AWS" value={name} onChange={setName} />

        <CategoryPicker value={category} onChange={setCategory} />

        <div style={{ marginBottom:"20px" }}>
          <label style={labelStyle}>AUTO-SCAN INTERVAL</label>
          <select value={interval} onChange={e => setInterval(Number(e.target.value))}
            style={{ ...inputStyle, cursor:"pointer" }}>
            <option value={0}>Manual only</option>
            <option value={0.25}>Continuous (every 15 min)</option>
            <option value={1}>Every hour</option>
            <option value={3}>Every 3 hours</option>
            <option value={6}>Every 6 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Every 24 hours</option>
            <option value={48}>Every 48 hours</option>
            <option value={72}>Every 3 days</option>
            <option value={168}>Weekly</option>
          </select>
        </div>

        {error && <div style={{ padding:"8px 12px", borderRadius:"6px", marginBottom:"14px",
          background:"rgba(224,85,85,0.1)", color:"var(--red)",
          border:"1px solid rgba(224,85,85,0.3)", fontSize:"12px",
          fontFamily:"var(--font-mono)" }}>{error}</div>}

        <div style={{ display:"flex", gap:"10px" }}>
          <button onClick={onClose} style={{ flex:1, padding:"10px",
            border:"1px solid var(--border)", borderRadius:"6px",
            background:"transparent", color:"var(--accent2)",
            fontFamily:"var(--font-ui)", fontSize:"13px", cursor:"pointer" }}>CANCEL</button>
          <button onClick={handleSave} disabled={saving} className="neon-btn" style={{ flex:2, padding:"10px",
            border:`1px solid ${saving ? "rgba(255,230,0,0.2)" : "var(--cyan)"}`,
            borderRadius:"6px", background:"transparent",
            color: saving ? "rgba(255,230,0,0.4)" : "var(--cyan)",
            fontFamily:"var(--font-ui)", fontWeight:700,
            fontSize:"13px", cursor: saving ? "not-allowed" : "pointer",
            boxShadow: saving ? "none" : "var(--glow-cyan)",
          }}>
            {saving ? "SAVING..." : "SAVE CHANGES"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Account Card ──────────────────────────────────────────────────────────────
function AccountCard({ account, token, role, onDelete, onScanComplete, onUpdate }) {
  const canScan = role !== "viewer";
  const [scanning,  setScanning]  = useState(false);
  const [lastScore, setLastScore] = useState(null);
  const [showEdit,  setShowEdit]  = useState(false);
  const [scanErr,   setScanErr]   = useState(null);
  const [deleteErr, setDeleteErr] = useState(null);

  async function handleScan() {
    setScanning(true);
    setScanErr(null);
    try {
      const res  = await fetch(`${API}/accounts/${account.id}/scan`, {
        method: "POST", headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setLastScore(data.scores?.overall ?? data.scores?.aws ?? data.scores?.azure);
        onScanComplete(data);
      } else {
        setScanErr(data.detail || "Scan failed. Please verify your credentials.");
      }
    } catch {
      setScanErr("Cannot reach the backend server. Please check your connection.");
    }
    finally { setScanning(false); }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${account.name}"? This removes all scan history.`)) return;
    setDeleteErr(null);
    try {
      const res = await fetch(`${API}/accounts/${account.id}`, {
        method: "DELETE", headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        onDelete(account.id);
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteErr(data.detail || "Failed to delete account.");
      }
    } catch {
      setDeleteErr("Cannot reach the backend server.");
    }
  }

  const score = lastScore;
  const lastScanned = account.last_scanned_at
    ? new Date(account.last_scanned_at).toLocaleString() : null;

  return (
    <div style={{ background:"var(--card)", border:"1px solid var(--border)",
      borderRadius:"10px", padding:"20px",
      borderLeft:`3px solid ${account.cloud==="aws" ? "#ff9900" : "#0089d6"}` }}>

      {showEdit && (
        <EditAccountModal account={account} token={token}
          onClose={() => setShowEdit(false)}
          onUpdated={u => { onUpdate(u); setShowEdit(false); }} />
      )}

      {/* Header row */}
      <div style={{ display:"flex", alignItems:"flex-start",
                    justifyContent:"space-between", marginBottom:"14px" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
            <span style={{ background: account.cloud==="aws" ? "#ff9900" : "#0089d6",
              color:"#000", fontSize:"9px", fontWeight:700, padding:"2px 6px",
              borderRadius:"3px", fontFamily:"var(--font-ui)", letterSpacing:"0.08em" }}>
              {account.cloud.toUpperCase()}
            </span>
            <CategoryBadge category={account.category || "General"} />
            <span style={{ color:"var(--accent)", fontSize:"15px",
              fontWeight:700, fontFamily:"var(--font-display)" }}>{account.name}</span>
          </div>
          {account.region && (
            <div style={{ color:"var(--accent3)", fontSize:"11px",
              fontFamily:"var(--font-mono)", marginTop:"4px" }}>{account.region}</div>
          )}
        </div>

        {/* Score + 3-dot menu */}
        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
          {score != null && (
            <div style={{ textAlign:"center" }}>
              <div style={{ color:scoreColor(score), fontSize:"24px", fontWeight:800,
                fontFamily:"var(--font-display)", lineHeight:1 }}>{score}</div>
              <div style={{ color:scoreColor(score), fontSize:"9px",
                fontFamily:"var(--font-ui)", letterSpacing:"0.08em" }}>{scoreLabel(score)}</div>
            </div>
          )}
          {canScan && <ThreeDotMenu onEdit={() => setShowEdit(true)} onDelete={handleDelete} />}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display:"flex", gap:"16px", marginBottom:"16px", flexWrap:"wrap" }}>
        <div style={{ color:"var(--accent3)", fontSize:"11px", fontFamily:"var(--font-mono)" }}>
          {account.scan_interval_hours === 0 ? "Manual scans only"
          : account.scan_interval_hours <= 0.3 ? "● Continuous (every 15 min)"
          : account.scan_interval_hours < 1
            ? `Every ${Math.round(account.scan_interval_hours * 60)} minutes`
          : account.scan_interval_hours < 24
            ? `Every ${account.scan_interval_hours}h`
          : account.scan_interval_hours === 168 ? "Weekly"
          : `Every ${account.scan_interval_hours / 24} days`}
        </div>
        <div style={{ color:"var(--accent3)", fontSize:"11px", fontFamily:"var(--font-mono)",
          fontStyle: lastScanned ? "normal" : "italic" }}>
          {lastScanned ? `Last scanned: ${lastScanned}` : "Never scanned"}
        </div>
      </div>

      {/* Error messages */}
      {scanErr && (
        <div style={{ marginBottom:"10px", padding:"8px 12px", borderRadius:"6px",
          background:"rgba(224,85,85,0.1)", color:"var(--red)",
          border:"1px solid rgba(224,85,85,0.3)", fontSize:"12px",
          fontFamily:"var(--font-mono)", display:"flex", alignItems:"center", gap:"8px" }}>
          <span>⚠</span>
          <span style={{ flex:1 }}>{scanErr}</span>
          <button onClick={() => setScanErr(null)} style={{ background:"transparent",
            border:"none", color:"var(--red)", cursor:"pointer", fontSize:"13px" }}>✕</button>
        </div>
      )}
      {deleteErr && (
        <div style={{ marginBottom:"10px", padding:"8px 12px", borderRadius:"6px",
          background:"rgba(224,85,85,0.1)", color:"var(--red)",
          border:"1px solid rgba(224,85,85,0.3)", fontSize:"12px",
          fontFamily:"var(--font-mono)" }}>
          ⚠ {deleteErr}
        </div>
      )}

      {/* Scan button — hidden for viewers */}
      {canScan ? (
        <button onClick={handleScan} disabled={scanning} className="neon-btn" style={{
          width:"100%", padding:"8px",
          border:`1px solid ${scanning ? "rgba(255,230,0,0.2)" : "var(--cyan)"}`,
          borderRadius:"6px", background:"transparent",
          color: scanning ? "rgba(255,230,0,0.4)" : "var(--cyan)",
          fontFamily:"var(--font-ui)", fontWeight:700, fontSize:"12px",
          letterSpacing:"0.08em", cursor: scanning ? "not-allowed" : "pointer",
          boxShadow: scanning ? "none" : "var(--glow-cyan)",
          textShadow: scanning ? "none" : "0 0 6px rgba(255,230,0,0.5)",
          transition:"all 0.15s" }}>
          {scanning ? "SCANNING..." : "SCAN NOW"}
        </button>
      ) : (
        <div style={{ width:"100%", padding:"8px", textAlign:"center",
          border:"1px solid var(--border)", borderRadius:"6px",
          color:"var(--accent3)", fontFamily:"var(--font-ui)",
          fontSize:"11px", letterSpacing:"0.1em" }}>
          VIEW ONLY
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountsPage({ token, role, onScanComplete }) {
  const canScan = role !== "viewer";
  const [accounts,   setAccounts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [pageError,  setPageError]  = useState(null);
  const [showModal,  setShowModal]  = useState(false);

  useEffect(() => { fetchAccounts(); }, []);

  async function fetchAccounts() {
    setPageError(null);
    try {
      const res  = await fetch(`${API}/accounts`, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts || []);
      } else {
        const data = await res.json().catch(() => ({}));
        setPageError(data.detail || "Failed to load accounts.");
      }
    } catch {
      setPageError("Cannot reach the backend server. Please check your connection.");
    }
    finally { setLoading(false); }
  }

  return (
    <div style={{ padding:"32px", maxWidth:"1100px", margin:"0 auto",
                  animation:"fadeIn 0.3s ease" }}>

      {showModal && (
        <AddAccountModal token={token}
          onClose={() => setShowModal(false)}
          onAdded={a => setAccounts(prev => [...prev, a])} />
      )}

      <div style={{ display:"flex", justifyContent:"space-between",
                    alignItems:"flex-start", marginBottom:"28px" }}>
        <div>
          <h1 style={{ fontFamily:"var(--font-display)", fontSize:"22px", fontWeight:700,
            color:"var(--accent)", letterSpacing:"0.05em", margin:0 }}>CLOUD ACCOUNTS</h1>
          <p style={{ color:"var(--accent3)", fontSize:"13px",
            marginTop:"4px", fontFamily:"var(--font-mono)" }}>
            {accounts.length} account{accounts.length !== 1 ? "s" : ""} configured
          </p>
        </div>
        {canScan && (
          <button onClick={() => setShowModal(true)} className="neon-btn" style={{
            padding:"9px 20px", background:"transparent", color:"var(--cyan)",
            border:"1px solid var(--cyan)", borderRadius:"6px", fontFamily:"var(--font-ui)",
            fontWeight:700, fontSize:"13px", cursor:"pointer", letterSpacing:"0.08em",
            boxShadow:"var(--glow-cyan)", textShadow:"0 0 8px rgba(255,230,0,0.5)",
          }}>+ ADD ACCOUNT</button>
        )}
      </div>

      {pageError && (
        <div style={{ marginBottom:"20px", padding:"12px 16px",
          background:"rgba(224,85,85,0.08)", border:"1px solid rgba(224,85,85,0.25)",
          borderRadius:"8px", color:"#e05555",
          fontFamily:"var(--font-mono)", fontSize:"12px",
          display:"flex", alignItems:"center", gap:"10px" }}>
          <span>⚠</span> {pageError}
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"60px",
                      color:"var(--accent3)", fontFamily:"var(--font-mono)" }}>
          <div style={{ width:"28px", height:"28px", border:"2px solid var(--border)",
            borderTop:"2px solid var(--cyan)", borderRadius:"50%",
            animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
          LOADING...
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div style={{ textAlign:"center", padding:"80px 20px",
          border:"1px dashed var(--border)", borderRadius:"12px" }}>
          <div style={{ fontSize:"40px", marginBottom:"16px" }}>☁</div>
          <div style={{ color:"var(--accent)", fontSize:"16px",
            fontFamily:"var(--font-display)", fontWeight:700, marginBottom:"8px" }}>
            NO ACCOUNTS YET
          </div>
          <div style={{ color:"var(--accent3)", fontSize:"13px",
            fontFamily:"var(--font-ui)", marginBottom:"24px" }}>
            Add your AWS or Azure accounts to start monitoring
          </div>
          {canScan && (
            <button onClick={() => setShowModal(true)} className="neon-btn" style={{
              padding:"10px 24px", background:"transparent", color:"var(--cyan)",
              border:"1px solid var(--cyan)", borderRadius:"6px", fontFamily:"var(--font-ui)",
              fontWeight:700, fontSize:"13px", cursor:"pointer", letterSpacing:"0.08em",
              boxShadow:"var(--glow-cyan)", textShadow:"0 0 8px rgba(255,230,0,0.5)" }}>
              + ADD YOUR FIRST ACCOUNT
            </button>
          )}
        </div>
      )}

      {!loading && accounts.length > 0 && (() => {
        // Group by category, preserve CATEGORIES order, unknown categories at end
        const grouped = {};
        accounts.forEach(a => {
          const cat = a.category || "General";
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(a);
        });
        const orderedCats = [
          ...CATEGORIES.filter(c => grouped[c]),
          ...Object.keys(grouped).filter(c => !CATEGORIES.includes(c)),
        ];
        return orderedCats.map(cat => {
          const s = getCategoryStyle(cat);
          return (
            <div key={cat} style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
                <span style={{
                  fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700,
                  color: s.color, letterSpacing: "0.12em", textTransform: "uppercase",
                }}>{cat}</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--accent3)",
                }}>{grouped[cat].length} account{grouped[cat].length !== 1 ? "s" : ""}</span>
                <div style={{ flex: 1, height: 1, background: s.border }} />
              </div>
              <div style={{ display:"grid",
                gridTemplateColumns:"repeat(auto-fill, minmax(340px, 1fr))", gap:"16px" }}>
                {grouped[cat].map(account => (
                  <AccountCard key={account.id} account={account} token={token} role={role}
                    onDelete={id => setAccounts(prev => prev.filter(a => a.id !== id))}
                    onUpdate={u  => setAccounts(prev => prev.map(a => a.id===u.id ? {...a,...u} : a))}
                    onScanComplete={onScanComplete} />
                ))}
              </div>
            </div>
          );
        });
      })()}
    </div>
  );
}
