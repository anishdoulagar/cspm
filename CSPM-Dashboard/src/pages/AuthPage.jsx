import { useState, useEffect, useRef } from "react";

// ── Animated particle-network background ──────────────────────────────────────
function ParticleBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx    = canvas.getContext("2d");
    let animId;

    function resize() {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    const COUNT = 70;
    const MAX_DIST = 150;
    const particles = Array.from({ length: COUNT }, () => ({
      x:  Math.random() * window.innerWidth,
      y:  Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r:  Math.random() * 1.5 + 0.8,
    }));

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // connections
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx   = particles[i].x - particles[j].x;
          const dy   = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            const alpha = (1 - dist / MAX_DIST) * 0.25;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,230,0,${alpha})`;
            ctx.lineWidth   = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // dots + glow
      for (const p of particles) {
        // outer glow
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        g.addColorStop(0, "rgba(255,230,0,0.12)");
        g.addColorStop(1, "rgba(255,230,0,0)");
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();

        // core dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,230,0,0.7)";
        ctx.fill();

        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: "fixed", inset: 0, width: "100%", height: "100%",
      zIndex: 0, pointerEvents: "none",
    }} />
  );
}

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  page: {
    display: "flex", alignItems: "center", justifyContent: "center",
    minHeight: "100vh", padding: "40px 20px",
    background: "var(--bg)",
    position: "relative",
    overflow: "hidden",
  },
  wrap: { width: "100%", maxWidth: "420px" },
  logo: {
    textAlign: "center", marginBottom: "36px",
  },
  logoTitle: {
    fontFamily: "var(--font-display)", fontSize: "32px", fontWeight: 900,
    color: "var(--cyan)", letterSpacing: "0.14em",
    textShadow: "var(--glow-cyan)",
  },
  logoSub: {
    color: "var(--accent3)", fontSize: "11px", marginTop: "8px",
    fontFamily: "var(--font-mono)", letterSpacing: "0.18em",
  },
  card: {
    background: "rgba(7,8,10,0.85)", border: "1px solid rgba(255,230,0,0.2)",
    borderRadius: "14px", overflow: "hidden",
    boxShadow: "0 24px 80px rgba(0,0,0,0.7), 0 0 60px rgba(255,230,0,0.05), inset 0 1px 0 rgba(255,230,0,0.08)",
    backdropFilter: "blur(12px)",
  },
  tabs: { display: "flex", borderBottom: "1px solid var(--border)" },
  tab: (active) => ({
    flex: 1, padding: "14px",
    background: active ? "rgba(0,212,255,0.05)" : "transparent",
    border: "none", cursor: "pointer",
    color: active ? "var(--cyan)" : "var(--accent3)",
    fontFamily: "var(--font-ui)", fontWeight: active ? 700 : 500,
    fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase",
    borderBottom: active ? "2px solid var(--cyan)" : "2px solid transparent",
    transition: "all 0.15s",
    textShadow: active ? "0 0 8px rgba(0,212,255,0.5)" : "none",
  }),
  form: { padding: "28px" },
  label: {
    display: "block", color: "var(--accent3)", fontSize: "10px",
    letterSpacing: "0.12em", marginBottom: "6px",
    fontFamily: "var(--font-ui)", fontWeight: 600, textTransform: "uppercase",
  },
  fieldWrap: { marginBottom: "16px" },
  inputWrap: { position: "relative" },
  input: {
    width: "100%", background: "var(--card)",
    border: "1px solid var(--border)", borderRadius: "7px",
    padding: "10px 12px", color: "var(--accent)",
    fontFamily: "var(--font-mono)", fontSize: "13px",
    boxSizing: "border-box", outline: "none", transition: "border-color 0.15s",
  },
  inputWithBtn: {
    paddingRight: "42px",
  },
  eyeBtn: {
    position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)",
    background: "none", border: "none", cursor: "pointer",
    color: "var(--accent3)", padding: "0", display: "flex", alignItems: "center",
    transition: "color 0.15s",
  },
  strengthBar: { display: "flex", gap: "4px", marginTop: "8px" },
  strengthSeg: (filled, color) => ({
    flex: 1, height: "3px", borderRadius: "2px",
    background: filled ? color : "var(--border)", transition: "background 0.2s",
  }),
  strengthLabel: { fontSize: "10px", marginTop: "5px", fontFamily: "var(--font-ui)" },
  error: {
    padding: "9px 12px", borderRadius: "7px", marginBottom: "14px",
    background: "rgba(224,85,85,0.08)", color: "#e05555",
    border: "1px solid rgba(224,85,85,0.25)",
    fontSize: "12px", fontFamily: "var(--font-mono)",
  },
  success: {
    padding: "9px 12px", borderRadius: "7px", marginBottom: "14px",
    background: "rgba(76,175,125,0.08)", color: "#4caf7d",
    border: "1px solid rgba(76,175,125,0.25)",
    fontSize: "12px", fontFamily: "var(--font-mono)",
  },
  btn: (loading) => ({
    width: "100%", padding: "12px",
    background: loading ? "rgba(0,212,255,0.15)" : "transparent",
    color: loading ? "rgba(0,212,255,0.5)" : "var(--cyan)",
    border: `1px solid ${loading ? "rgba(0,212,255,0.2)" : "var(--cyan)"}`,
    borderRadius: "7px",
    fontFamily: "var(--font-ui)", fontWeight: 700, fontSize: "13px",
    letterSpacing: "0.14em", cursor: loading ? "not-allowed" : "pointer",
    transition: "all 0.15s", textTransform: "uppercase",
    boxShadow: loading ? "none" : "var(--glow-cyan)",
    textShadow: loading ? "none" : "0 0 8px rgba(0,212,255,0.6)",
  }),
  hint: {
    textAlign: "center", marginTop: "16px",
    color: "var(--accent3)", fontSize: "12px", fontFamily: "var(--font-ui)",
  },
  link: { color: "var(--accent)", cursor: "pointer", fontWeight: 600 },
  divider: {
    display: "flex", alignItems: "center", gap: "12px",
    margin: "18px 0", color: "var(--accent3)", fontSize: "11px",
    fontFamily: "var(--font-ui)",
  },
  dividerLine: { flex: 1, height: "1px", background: "var(--border)" },
  forgotLink: {
    display: "block", textAlign: "right", marginTop: "-8px", marginBottom: "14px",
    color: "var(--accent3)", fontSize: "11px", fontFamily: "var(--font-ui)",
    cursor: "pointer", transition: "color 0.15s",
  },
  backLink: {
    display: "flex", alignItems: "center", gap: "6px",
    color: "var(--accent3)", fontSize: "12px", fontFamily: "var(--font-ui)",
    cursor: "pointer", marginBottom: "20px", transition: "color 0.15s",
  },
};

// ── Password strength ─────────────────────────────────────────────────────────

function passwordStrength(pw) {
  if (!pw) return { level: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { level: 1, label: "Weak",   color: "#e05555" };
  if (score <= 2) return { level: 2, label: "Fair",   color: "#d97b3a" };
  if (score <= 3) return { level: 3, label: "Good",   color: "#c9a84c" };
  if (score <= 4) return { level: 4, label: "Strong", color: "#4caf7d" };
  return                { level: 5, label: "Very strong", color: "#4caf7d" };
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PasswordField({ label, value, onChange, showStrength = false }) {
  const [show, setShow] = useState(false);
  const strength = showStrength ? passwordStrength(value) : null;

  return (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      <div style={S.inputWrap}>
        <input
          type={show ? "text" : "password"}
          placeholder="••••••••"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ ...S.input, ...S.inputWithBtn }}
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          style={S.eyeBtn}
          tabIndex={-1}
          title={show ? "Hide password" : "Show password"}
        >
          {show
            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          }
        </button>
      </div>
      {showStrength && value && (
        <>
          <div style={S.strengthBar}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={S.strengthSeg(strength.level >= i, strength.color)} />
            ))}
          </div>
          <div style={{ ...S.strengthLabel, color: strength.color }}>
            {strength.label}
          </div>
        </>
      )}
    </div>
  );
}

function TextField({ label, type = "text", placeholder, value, onChange }) {
  return (
    <div style={S.fieldWrap}>
      <label style={S.label}>{label}</label>
      <input
        type={type} placeholder={placeholder}
        value={value} onChange={e => onChange(e.target.value)}
        style={S.input} autoComplete="off"
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AuthPage({ onAuth, initialResetToken = null }) {
  // tab: "login" | "signup" | "forgot" | "reset"
  const [tab,        setTab]        = useState(initialResetToken ? "reset" : "login");
  const [name,       setName]       = useState("");
  const [username,   setUsername]   = useState("");
  const [email,      setEmail]      = useState("");
  const [password,   setPassword]   = useState("");
  const [resetPw,    setResetPw]    = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(null);
  const [resetToken, setResetToken] = useState(initialResetToken || "");

  function switchTab(t) {
    setTab(t);
    setError(null); setSuccess(null);
    setName(""); setUsername(""); setEmail(""); setPassword(""); setResetPw("");
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleSubmit();
  }

  async function handleSubmit() {
    setError(null); setSuccess(null);

    if (tab === "login")  return handleLogin();
    if (tab === "signup") return handleSignup();
    if (tab === "forgot") return handleForgot();
    if (tab === "reset")  return handleReset();
  }

  async function handleLogin() {
    if (!username || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/login`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Login failed."); return; }
      onAuth(data.token, data.user);
    } catch { setError("Unable to connect. Please try again."); }
    finally  { setLoading(false); }
  }

  async function handleSignup() {
    if (!username || !email || !password || !name) { setError("Please fill in all fields."); return; }
    if (username.length < 3) { setError("Username must be at least 3 characters."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/signup`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, name }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Sign up failed."); return; }
      onAuth(data.token, data.user);
    } catch { setError("Unable to connect. Please try again."); }
    finally  { setLoading(false); }
  }

  async function handleForgot() {
    if (!email) { setError("Please enter your email address."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/forgot-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Request failed."); return; }
      setSuccess("If that email is registered, a reset link has been sent.");
    } catch { setError("Unable to connect. Please try again."); }
    finally  { setLoading(false); }
  }

  async function handleReset() {
    if (!resetPw) { setError("Please enter a new password."); return; }
    if (resetPw.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (!resetToken) { setError("Missing reset token. Please use the link from your email."); return; }
    setLoading(true);
    try {
      const res  = await fetch(`${API}/auth/reset-password`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: resetToken, new_password: resetPw }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Reset failed."); return; }
      setSuccess("Password updated! You can now sign in with your new password.");
      setTimeout(() => switchTab("login"), 2500);
    } catch { setError("Unable to connect. Please try again."); }
    finally  { setLoading(false); }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function renderLoginForm() {
    return (
      <div style={S.form} onKeyDown={handleKeyDown}>
        <TextField label="Username" placeholder="your username"
                   value={username} onChange={setUsername} />
        <PasswordField label="Password" value={password} onChange={setPassword} />

        <span
          style={S.forgotLink}
          onClick={() => switchTab("forgot")}
          onMouseEnter={e => e.target.style.color = "var(--accent)"}
          onMouseLeave={e => e.target.style.color = "var(--accent3)"}
        >
          Forgot password?
        </span>

        {error   && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading} className="neon-btn" style={S.btn(loading)}>
          {loading ? "SIGNING IN..." : "SIGN IN →"}
        </button>

        <p style={S.hint}>
          Don't have an account?{" "}
          <span style={S.link} onClick={() => switchTab("signup")}>Sign up</span>
        </p>
      </div>
    );
  }

  function renderSignupForm() {
    return (
      <div style={S.form} onKeyDown={handleKeyDown}>
        <TextField label="Full Name" placeholder="Your name"
                   value={name} onChange={setName} />
        <TextField label="Username" placeholder="choose a username"
                   value={username} onChange={setUsername} />
        <TextField label="Email" type="email" placeholder="you@example.com"
                   value={email} onChange={setEmail} />
        <PasswordField label="Password" value={password} onChange={setPassword} showStrength />

        {error   && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading} className="neon-btn" style={S.btn(loading)}>
          {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT →"}
        </button>

        <p style={S.hint}>
          Already have an account?{" "}
          <span style={S.link} onClick={() => switchTab("login")}>Sign in</span>
        </p>
      </div>
    );
  }

  function renderForgotForm() {
    return (
      <div style={S.form} onKeyDown={handleKeyDown}>
        <span
          style={S.backLink}
          onClick={() => switchTab("login")}
          onMouseEnter={e => e.currentTarget.style.color = "var(--accent)"}
          onMouseLeave={e => e.currentTarget.style.color = "var(--accent3)"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to sign in
        </span>

        <p style={{ color: "var(--accent3)", fontSize: "13px", marginTop: 0, marginBottom: "20px",
                    fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
          Enter your email and we'll send you a reset link if that account exists.
        </p>

        <TextField label="Email" type="email" placeholder="you@example.com"
                   value={email} onChange={setEmail} />

        {error   && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading} className="neon-btn" style={S.btn(loading)}>
          {loading ? "SENDING..." : "SEND RESET LINK →"}
        </button>
      </div>
    );
  }

  function renderResetForm() {
    return (
      <div style={S.form} onKeyDown={handleKeyDown}>
        <p style={{ color: "var(--accent3)", fontSize: "13px", marginTop: 0, marginBottom: "20px",
                    fontFamily: "var(--font-ui)", lineHeight: 1.6 }}>
          Enter your new password below.
        </p>

        <PasswordField label="New Password" value={resetPw} onChange={setResetPw} showStrength />

        {error   && <div style={S.error}>{error}</div>}
        {success && <div style={S.success}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading} className="neon-btn" style={S.btn(loading)}>
          {loading ? "UPDATING..." : "SET NEW PASSWORD →"}
        </button>

        <p style={S.hint}>
          <span style={S.link} onClick={() => switchTab("login")}>Back to sign in</span>
        </p>
      </div>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  const isForgotOrReset = tab === "forgot" || tab === "reset";

  return (
    <div style={S.page}>

      {/* ── Animated particle background ── */}
      <ParticleBackground />

      {/* ── CSS grid overlay ── */}
      <div style={{
        position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
        backgroundImage: `
          linear-gradient(rgba(255,230,0,0.03) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,230,0,0.03) 1px, transparent 1px)
        `,
        backgroundSize: "60px 60px",
      }} />

      {/* ── Corner neon glows ── */}
      <div style={{
        position: "fixed", top: -120, left: -120, width: 400, height: 400,
        background: "radial-gradient(circle, rgba(255,230,0,0.07) 0%, transparent 70%)",
        zIndex: 0, pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed", bottom: -100, right: -100, width: 500, height: 500,
        background: "radial-gradient(circle, rgba(255,60,0,0.06) 0%, transparent 70%)",
        zIndex: 0, pointerEvents: "none",
      }} />
      <div style={{
        position: "fixed", top: "40%", right: -80, width: 300, height: 300,
        background: "radial-gradient(circle, rgba(57,255,20,0.04) 0%, transparent 70%)",
        zIndex: 0, pointerEvents: "none",
      }} />

      {/* ── Corner bracket decorations ── */}
      {[
        { top: 24, left: 24, borderTop: "1px solid", borderLeft: "1px solid" },
        { top: 24, right: 24, borderTop: "1px solid", borderRight: "1px solid" },
        { bottom: 24, left: 24, borderBottom: "1px solid", borderLeft: "1px solid" },
        { bottom: 24, right: 24, borderBottom: "1px solid", borderRight: "1px solid" },
      ].map((pos, i) => (
        <div key={i} style={{
          position: "fixed", width: 32, height: 32,
          borderColor: "rgba(255,230,0,0.2)", zIndex: 1, pointerEvents: "none",
          ...pos,
        }} />
      ))}

      {/* ── System status tags ── */}
      <div style={{
        position: "fixed", bottom: 24, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 24,
        zIndex: 1, pointerEvents: "none",
      }}>
        {["SYSTEM ONLINE", "ENCRYPTION ACTIVE", "MULTI-CLOUD READY"].map(label => (
          <span key={label} style={{
            fontFamily: "var(--font-mono)", fontSize: "9px",
            color: "rgba(255,230,0,0.2)", letterSpacing: "0.2em",
          }}>{label}</span>
        ))}
      </div>

      <div style={{ ...S.wrap, position: "relative", zIndex: 2 }}>

        {/* Logo */}
        <div style={S.logo}>
          <div style={S.logoTitle}>VANGUARD</div>
          <div style={S.logoSub}>
            {tab === "forgot" ? "// PASSWORD RECOVERY" :
             tab === "reset"  ? "// SET NEW PASSWORD"  :
             "// CLOUD SECURITY POSTURE MANAGEMENT"}
          </div>
        </div>


        {/* Card */}
        <div style={S.card}>

          {/* Tab bar — only for login/signup */}
          {!isForgotOrReset && (
            <div style={S.tabs}>
              {[
                { id: "login",  label: "Sign In" },
                { id: "signup", label: "Create Account" },
              ].map(({ id, label }) => (
                <button key={id} onClick={() => switchTab(id)} style={S.tab(tab === id)}>
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Forgot / Reset header */}
          {isForgotOrReset && (
            <div style={{
              padding: "16px 28px",
              color: "var(--cyan)", fontFamily: "var(--font-ui)",
              fontWeight: 700, fontSize: "13px", letterSpacing: "0.1em",
              textTransform: "uppercase",
              borderBottom: "1px solid rgba(0,212,255,0.15)",
              textShadow: "0 0 8px rgba(0,212,255,0.5)",
            }}>
              {tab === "forgot" ? "Reset Password" : "New Password"}
            </div>
          )}

          {/* Forms */}
          {tab === "login"  && renderLoginForm()}
          {tab === "signup" && renderSignupForm()}
          {tab === "forgot" && renderForgotForm()}
          {tab === "reset"  && renderResetForm()}

        </div>
      </div>
    </div>
  );
}
