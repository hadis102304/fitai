import { useState, useEffect, useRef, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import {
  supabase, signUp, signIn, signInGoogle, signOut as sbSignOut,
  onAuthChange, getProfile, upsertProfile, incrementGenerations,
  getSavedPlans, savePlan, deletePlan,
  getWeightLog, logWeight, deleteWeightEntry,
} from "./lib/supabase";

// ─── Constants ───────────────────────────────────────────────────────────────
const A = "#C5F135", BG = "#080808", S1 = "#111111", S2 = "#181818";
const BD = "#282828", T1 = "#FFFFFF", T2 = "#888888";
const FREE_LIMIT = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function calcTDEE({ age, sex, heightFt, heightIn, weight, activity }) {
  const kg = weight * 0.453592;
  const cm = (parseInt(heightFt) * 12 + parseInt(heightIn || 0)) * 2.54;
  const bmr = sex === "male"
    ? 10 * kg + 6.25 * cm - 5 * parseInt(age) + 5
    : 10 * kg + 6.25 * cm - 5 * parseInt(age) - 161;
  const mult = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very: 1.9 };
  return Math.round(bmr * (mult[activity] || 1.55));
}

async function callClaude(messages, system) {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system, messages }),
    });
    const d = await r.json();
    return d.content[0].text;
  } catch { return "Something went wrong. Please try again."; }
}

// ─── UI Primitives ───────────────────────────────────────────────────────────
function Btn({ children, onClick, disabled, full, sm, outline }) {
  const [h, sH] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
      onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
      style={{ background: outline ? "transparent" : h && !disabled ? "#d4ff4a" : A, color: outline ? (h ? T1 : T2) : BG, border: outline ? `1px solid ${h ? T2 : BD}` : "none", borderRadius: 10, padding: sm ? "6px 14px" : "11px 22px", fontWeight: 600, fontSize: sm ? 12 : 14, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", width: full ? "100%" : "auto", opacity: disabled ? 0.5 : 1, transition: "background 0.15s" }}>
      {children}
    </button>
  );
}

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: active ? A : "transparent", color: active ? BG : T2, border: `1px solid ${active ? A : BD}`, borderRadius: 7, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400, transition: "all 0.12s" }}>
      {label}
    </button>
  );
}

function MuscleChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: active ? `${A}20` : "transparent", color: active ? A : T2, border: `1px solid ${active ? A : BD}`, borderRadius: 6, padding: "4px 11px", fontSize: 11, cursor: "pointer", fontFamily: "inherit", fontWeight: active ? 600 : 400 }}>
      {label}
    </button>
  );
}

function Card({ children, style }) {
  return <div style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 14, padding: 18, ...style }}>{children}</div>;
}

function Label({ children }) {
  return <p style={{ color: T2, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 10px", fontWeight: 500 }}>{children}</p>;
}

function TextInput({ value, onChange, placeholder, type = "text", onEnter }) {
  return (
    <input value={value} onChange={onChange} placeholder={placeholder} type={type}
      onKeyDown={e => e.key === "Enter" && onEnter?.()}
      style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 10, padding: "11px 14px", color: T1, fontSize: 14, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }} />
  );
}

function StatCard({ label, value, sub, accentSub }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <Label>{label}</Label>
      <p style={{ color: T1, fontSize: 22, fontFamily: "'Bebas Neue', cursive", margin: "0 0 4px", letterSpacing: 1.5 }}>{value}</p>
      {sub && <p style={{ color: accentSub ? A : T2, fontSize: 12, margin: 0 }}>{sub}</p>}
    </Card>
  );
}

function UsageBar({ used, plan }) {
  if (plan === "pro") return null;
  const pct = Math.min((used / FREE_LIMIT) * 100, 100);
  const remaining = Math.max(FREE_LIMIT - used, 0);
  return (
    <div style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: T2, fontSize: 11 }}>{remaining > 0 ? `${remaining} free AI generations left` : "Free limit reached"}</span>
        <span style={{ color: T2, fontSize: 11 }}>{used}/{FREE_LIMIT}</span>
      </div>
      <div style={{ background: BD, borderRadius: 4, height: 4 }}>
        <div style={{ background: remaining > 3 ? A : "#ef4444", borderRadius: 4, height: 4, width: `${pct}%`, transition: "width 0.3s" }} />
      </div>
    </div>
  );
}

function UpgradePrompt({ onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
      <Card style={{ maxWidth: 380, width: "100%", textAlign: "center", padding: 28 }}>
        <p style={{ color: A, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 12px", fontWeight: 600 }}>Free Limit Reached</p>
        <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, margin: "0 0 12px", letterSpacing: 1.5 }}>UPGRADE TO <span style={{ color: A }}>PRO</span></h2>
        <p style={{ color: T2, fontSize: 13, margin: "0 0 24px", lineHeight: 1.6 }}>You've used your {FREE_LIMIT} free AI generations this month. Upgrade for unlimited workouts, meal plans, and AI coaching.</p>
        <div style={{ background: `${A}15`, border: `1px solid ${A}35`, borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <p style={{ color: A, fontFamily: "'Bebas Neue', cursive", fontSize: 32, margin: "0 0 4px", letterSpacing: 1 }}>$12 / MONTH</p>
          <p style={{ color: T2, fontSize: 12, margin: 0 }}>Unlimited generations · Full history · Priority support</p>
        </div>
        <Btn full onClick={() => window.open("https://buy.stripe.com/your-link", "_blank")}>Upgrade to Pro →</Btn>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: T2, fontSize: 12, cursor: "pointer", marginTop: 12, fontFamily: "inherit" }}>Maybe later</button>
      </Card>
    </div>
  );
}

function AIResult({ text, onSave, saved }) {
  if (!text) return null;
  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Label>Result</Label>
        {onSave && (
          <button onClick={onSave} style={{ background: saved ? `${A}20` : A, color: saved ? A : BG, border: saved ? `1px solid ${A}` : "none", borderRadius: 8, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: saved ? "default" : "pointer", fontFamily: "inherit" }}>
            {saved ? "✓ Saved" : "Save Plan"}
          </button>
        )}
      </div>
      <p style={{ color: T1, fontSize: 13, lineHeight: 1.75, margin: 0, whiteSpace: "pre-wrap" }}>{text}</p>
    </Card>
  );
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email || !password) { setErr("Please fill in all fields."); return; }
    if (mode === "signup" && !name) { setErr("Please enter your name."); return; }
    setLoading(true); setErr("");
    const { data, error } = mode === "signup"
      ? await signUp(email, password, name)
      : await signIn(email, password);
    if (error) { setErr(error.message); setLoading(false); return; }
    const userName = data.user?.user_metadata?.name || name || email.split("@")[0];
    onAuth({ id: data.user.id, email, name: userName, isNew: mode === "signup" });
    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    await signInGoogle();
    // Redirect handled by Supabase — onAuthStateChange picks it up on return
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 60, color: A, letterSpacing: 6, margin: "0 0 8px", lineHeight: 1 }}>FITAI</h1>
          <p style={{ color: T2, fontSize: 14, margin: 0 }}>Your AI-powered fitness coach</p>
        </div>

        <button onClick={handleGoogle} disabled={loading}
          style={{ width: "100%", background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: "11px 0", color: T1, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/><path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.173 0 7.548 0 9s.347 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/></svg>
          Continue with Google
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, height: 1, background: BD }} />
          <span style={{ color: T2, fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: BD }} />
        </div>

        <Card>
          <div style={{ display: "flex", gap: 4, marginBottom: 20, background: S1, borderRadius: 10, padding: 4 }}>
            {[["login", "Log In"], ["signup", "Sign Up"]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }}
                style={{ flex: 1, background: mode === m ? A : "transparent", color: mode === m ? BG : T2, border: "none", borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {l}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {mode === "signup" && <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Your name" />}
            <TextInput value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" type="email" />
            <TextInput value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" onEnter={submit} />
            {err && <p style={{ color: "#ef4444", fontSize: 12, margin: 0 }}>{err}</p>}
            <div style={{ marginTop: 4 }}>
              <Btn onClick={submit} disabled={loading} full>{loading ? "..." : mode === "login" ? "Log In" : "Create Account"}</Btn>
            </div>
          </div>
        </Card>

        <p style={{ color: T2, fontSize: 11, textAlign: "center", marginTop: 20, lineHeight: 1.8 }}>
          Free plan includes {FREE_LIMIT} AI generations/month.<br />
          <span style={{ color: A }}>Pro</span> is $12/month for unlimited access.
        </p>
      </div>
    </div>
  );
}

// ─── ONBOARDING ──────────────────────────────────────────────────────────────
function OnboardingScreen({ onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ age: "", sex: "male", heightFt: "5", heightIn: "9", weight: "", goalWeight: "", fitnessGoal: "fat_loss", activity: "moderate" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const OBtn = ({ val, fKey, label, desc }) => (
    <button onClick={() => set(fKey, val)} style={{ background: form[fKey] === val ? `${A}15` : "transparent", border: `1px solid ${form[fKey] === val ? A : BD}`, borderRadius: 12, padding: "11px 14px", cursor: "pointer", textAlign: "left", width: "100%" }}>
      <p style={{ color: form[fKey] === val ? A : T1, fontWeight: 600, fontSize: 13, margin: "0 0 2px", fontFamily: "inherit" }}>{label}</p>
      {desc && <p style={{ color: T2, fontSize: 11, margin: 0, fontFamily: "inherit" }}>{desc}</p>}
    </button>
  );

  const steps = [
    {
      title: "A bit about you",
      valid: !!form.age,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div><Label>Your Age</Label><TextInput value={form.age} onChange={e => set("age", e.target.value)} placeholder="e.g. 28" type="number" /></div>
          <div>
            <Label>Sex</Label>
            <div style={{ display: "flex", gap: 8 }}>
              {[["male","Male"],["female","Female"]].map(([v,l]) => (
                <button key={v} onClick={() => set("sex", v)} style={{ flex: 1, background: form.sex === v ? A : "transparent", color: form.sex === v ? BG : T2, border: `1px solid ${form.sex === v ? A : BD}`, borderRadius: 10, padding: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>{l}</button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Your measurements",
      valid: !!form.weight,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <Label>Height</Label>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><TextInput value={form.heightFt} onChange={e => set("heightFt", e.target.value)} placeholder="ft" type="number" /><p style={{ color: T2, fontSize: 11, margin: "4px 0 0", textAlign: "center" }}>feet</p></div>
              <div style={{ flex: 1 }}><TextInput value={form.heightIn} onChange={e => set("heightIn", e.target.value)} placeholder="in" type="number" /><p style={{ color: T2, fontSize: 11, margin: "4px 0 0", textAlign: "center" }}>inches</p></div>
            </div>
          </div>
          <div><Label>Current Weight (lbs)</Label><TextInput value={form.weight} onChange={e => set("weight", e.target.value)} placeholder="e.g. 185" type="number" /></div>
        </div>
      ),
    },
    {
      title: "What's your goal?",
      valid: !!form.goalWeight,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <OBtn val="fat_loss" fKey="fitnessGoal" label="Lose Fat" desc="Reduce body fat while keeping muscle" />
          <OBtn val="muscle_gain" fKey="fitnessGoal" label="Build Muscle" desc="Increase lean muscle mass and strength" />
          <OBtn val="maintenance" fKey="fitnessGoal" label="Maintain" desc="Stay at current weight, improve fitness" />
          <div style={{ marginTop: 8 }}><Label>Goal Weight (lbs)</Label><TextInput value={form.goalWeight} onChange={e => set("goalWeight", e.target.value)} placeholder="e.g. 165" type="number" /></div>
        </div>
      ),
    },
    {
      title: "How active are you?",
      valid: true,
      content: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <OBtn val="sedentary" fKey="activity" label="Sedentary" desc="Desk job, little to no exercise" />
          <OBtn val="light" fKey="activity" label="Lightly Active" desc="Exercise 1–3 days/week" />
          <OBtn val="moderate" fKey="activity" label="Moderately Active" desc="Exercise 3–5 days/week" />
          <OBtn val="active" fKey="activity" label="Very Active" desc="Hard exercise 6–7 days/week" />
          <OBtn val="very" fKey="activity" label="Extremely Active" desc="Physical job + daily training" />
        </div>
      ),
    },
  ];

  const cur = steps[step];
  const isLast = step === steps.length - 1;

  const finish = () => {
    const tdee = calcTDEE({ age: form.age, sex: form.sex, heightFt: form.heightFt, heightIn: form.heightIn, weight: parseFloat(form.weight), activity: form.activity });
    const calorieGoal = form.fitnessGoal === "fat_loss" ? tdee - 500 : form.fitnessGoal === "muscle_gain" ? tdee + 300 : tdee;
    onComplete({ ...form, age: parseInt(form.age), weight: parseFloat(form.weight), goalWeight: parseFloat(form.goalWeight), tdee, calorieGoal });
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ width: "100%", maxWidth: 440 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
          {steps.map((_, i) => <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? A : BD, transition: "background 0.3s" }} />)}
        </div>
        <p style={{ color: T2, fontSize: 12, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: 1 }}>Step {step + 1} of {steps.length}</p>
        <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, margin: "0 0 24px", letterSpacing: 1.5 }}>{cur.title}</h2>
        {cur.content}
        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          {step > 0 && <Btn onClick={() => setStep(s => s - 1)} outline full>Back</Btn>}
          <Btn onClick={isLast ? finish : () => setStep(s => s + 1)} disabled={!cur.valid} full>{isLast ? "Let's Go →" : "Continue"}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── HOME ────────────────────────────────────────────────────────────────────
function Home({ profile, setTab, savedPlans }) {
  const tips = [
    "Aim for 8,000–10,000 steps daily — burns 300–500 extra calories.",
    "Drink water before each meal to reduce hunger and aid digestion.",
    "Sleep 7–9 hours. Poor sleep raises cortisol and increases fat storage.",
    "Strength training 3×/week boosts metabolism for up to 48 hours after.",
    "Protein keeps you full longer. Aim for 0.8–1g per lb of bodyweight.",
  ];
  const [tipIdx] = useState(Math.floor(Math.random() * tips.length));

  const QuickBtn = ({ label, sub, id }) => {
    const [h, sH] = useState(false);
    return (
      <button onClick={() => setTab(id)} onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
        style={{ background: "transparent", border: `1px solid ${h ? A : BD}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", textAlign: "left", transition: "border-color 0.15s" }}>
        <p style={{ color: h ? A : T1, fontWeight: 600, fontSize: 13, margin: "0 0 3px", fontFamily: "inherit", transition: "color 0.15s" }}>{label}</p>
        <p style={{ color: T2, fontSize: 11, margin: 0, fontFamily: "inherit" }}>{sub}</p>
      </button>
    );
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 46, margin: "0 0 4px", letterSpacing: 3, lineHeight: 1 }}>
          HEY, <span style={{ color: A }}>{(profile?.name || "CHAMP").toUpperCase()}</span>
        </h1>
        <p style={{ color: T2, margin: 0, fontSize: 14 }}>Ready to crush today's goals?</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>
        <StatCard label="Current Weight" value={`${profile?.weight || "--"} LBS`} sub={`Goal: ${profile?.goalWeight || "--"} lbs`} />
        <StatCard label="To Goal" value={`${profile ? Math.abs(profile.weight - profile.goalWeight).toFixed(1) : "--"} LBS`} sub={profile?.fitnessGoal?.replace("_", " ")} accentSub />
        <StatCard label="Daily Cal Target" value={profile?.calorieGoal?.toLocaleString() || "--"} sub="Based on your TDEE" />
        <StatCard label="Saved Plans" value={String(savedPlans.length)} sub={`${savedPlans.filter(p => p.type === "workout").length} workouts · ${savedPlans.filter(p => p.type === "meal").length} meals`} />
      </div>

      {profile?.tdee && (
        <Card style={{ marginBottom: 16 }}>
          <Label>Your Calculated Numbers</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[["TDEE", profile.tdee.toLocaleString()], ["Cal Target", profile.calorieGoal.toLocaleString()], ["Daily Δ", `${profile.calorieGoal > profile.tdee ? "+" : ""}${profile.calorieGoal - profile.tdee}`]].map(([l, v]) => (
              <div key={l} style={{ textAlign: "center" }}>
                <p style={{ color: T2, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, margin: "0 0 4px" }}>{l}</p>
                <p style={{ color: T1, fontFamily: "'Bebas Neue', cursive", fontSize: 22, margin: 0, letterSpacing: 1 }}>{v}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <Label>Quick Actions</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <QuickBtn label="Ask AI Coach" sub="Knows your profile" id="chat" />
          <QuickBtn label="Generate Workout" sub="Custom split + muscles" id="workout" />
          <QuickBtn label="Plan Meals" sub={`~${profile?.calorieGoal?.toLocaleString() || "2000"} kcal`} id="meals" />
          <QuickBtn label="Log Progress" sub="Track your weight" id="progress" />
        </div>
      </Card>

      <div style={{ background: `${A}12`, border: `1px solid ${A}35`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <p style={{ color: A, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, margin: "0 0 6px", fontWeight: 500 }}>Tip of the Day</p>
        <p style={{ color: T1, fontSize: 13, margin: 0, lineHeight: 1.65 }}>{tips[tipIdx]}</p>
      </div>

      <p style={{ color: T2, fontSize: 11, textAlign: "center", lineHeight: 1.6, margin: 0 }}>
        FitAI is not a substitute for professional medical advice.<br />Consult a doctor or registered dietitian before starting any new diet or exercise program.
      </p>
    </div>
  );
}

// ─── COACH ───────────────────────────────────────────────────────────────────
function Coach({ profile, generationsUsed, plan, onGeneration }) {
  const sys = profile
    ? `You are FitAI, a knowledgeable personal fitness coach. You know your client:
Name: ${profile.name}, Age: ${profile.age}, Sex: ${profile.sex}
Current weight: ${profile.weight} lbs → Goal: ${profile.goalWeight} lbs
Goal: ${profile.fitnessGoal?.replace("_", " ")}, Activity: ${profile.activity}
TDEE: ${profile.tdee} kcal/day, Daily calorie target: ${profile.calorieGoal} kcal
Use this naturally. Address by name occasionally. Give specific, tailored advice. Be direct and concise (2–4 paragraphs or a short list).`
    : "You are FitAI, a knowledgeable fitness and nutrition coach. Give practical, evidence-based, specific advice. Be encouraging and concise.";

  const intro = profile
    ? `Hey ${profile.name}! I know your stats — ${profile.weight} lbs aiming for ${profile.goalWeight} lbs, ${profile.calorieGoal.toLocaleString()} kcal/day target. What can I help you with?`
    : "Hey! I'm your AI fitness coach. Ask me anything about workouts, nutrition, weight loss, or recovery.";

  const [msgs, setMsgs] = useState([{ role: "assistant", content: intro }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const bottomRef = useRef(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    if (plan !== "pro" && generationsUsed >= FREE_LIMIT) { setShowUpgrade(true); return; }
    const userMsg = { role: "user", content: input.trim() };
    const next = [...msgs, userMsg];
    setMsgs(next);
    setInput("");
    setLoading(true);
    const reply = await callClaude(next.map(m => ({ role: m.role, content: m.content })), sys);
    setMsgs([...next, { role: "assistant", content: reply }]);
    await onGeneration();
    setLoading(false);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, loading]);

  const suggestions = profile?.fitnessGoal === "fat_loss"
    ? ["How do I break a weight loss plateau?", "Best fat loss exercises for me?", "Should I do cardio or weights first?"]
    : ["How many calories for muscle gain?", "Best protein sources?", "How do I structure a PPL split?"];

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}
      <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, letterSpacing: 2, margin: "0 0 4px" }}>AI <span style={{ color: A }}>COACH</span></h2>
      {profile && <p style={{ color: T2, fontSize: 13, margin: "0 0 16px" }}>Personalized for {profile.name} · {profile.weight} lbs → {profile.goalWeight} lbs</p>}
      <UsageBar used={generationsUsed} plan={plan} />

      {msgs.length === 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {suggestions.map(s => (
            <button key={s} onClick={() => setInput(s)} style={{ background: "transparent", border: `1px solid ${BD}`, borderRadius: 20, padding: "6px 14px", color: T2, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>{s}</button>
          ))}
        </div>
      )}

      <div style={{ minHeight: 280, maxHeight: 400, overflowY: "auto", marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", gap: 8 }}>
            {m.role === "assistant" && <div style={{ width: 28, height: 28, borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: BG, flexShrink: 0, marginTop: 4 }}>AI</div>}
            <div style={{ background: m.role === "user" ? A : S2, color: m.role === "user" ? BG : T1, padding: "10px 14px", borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px", maxWidth: "78%", fontSize: 13, lineHeight: 1.65, border: m.role === "assistant" ? `1px solid ${BD}` : "none" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: A, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: BG, flexShrink: 0 }}>AI</div>
            <div style={{ background: S2, border: `1px solid ${BD}`, padding: "10px 16px", borderRadius: "4px 18px 18px 18px" }}><span style={{ color: T2, fontSize: 13 }}>Thinking...</span></div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Ask your coach anything..."
          style={{ flex: 1, background: S2, border: `1px solid ${BD}`, borderRadius: 10, padding: "10px 14px", color: T1, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
        <Btn onClick={send} disabled={loading || !input.trim()}>Send</Btn>
      </div>
    </div>
  );
}

// ─── WORKOUT GENERATOR ───────────────────────────────────────────────────────
const MUSCLES = ["Chest","Back","Shoulders","Biceps","Triceps","Forearms","Quads","Hamstrings","Glutes","Calves","Core","Traps"];
const SPLITS = [
  { id:"ppl", label:"Push / Pull / Legs", days:"3–6 days/wk", desc:"Classic hypertrophy split" },
  { id:"upper_lower", label:"Upper / Lower", days:"4 days/wk", desc:"Balanced strength & size" },
  { id:"full_body", label:"Full Body", days:"3 days/wk", desc:"Best for fat loss & beginners" },
  { id:"bro_split", label:"Bro Split", days:"5 days/wk", desc:"One muscle group per day" },
  { id:"arnold", label:"Arnold Split", days:"6 days/wk", desc:"Chest+Back, Shoulders+Arms, Legs" },
  { id:"5day", label:"5-Day Split", days:"5 days/wk", desc:"High volume, advanced" },
];

function WorkoutGen({ profile, userId, savedPlans, setSavedPlans, generationsUsed, plan, onGeneration }) {
  const [form, setForm] = useState({ level: "intermediate", goal: profile?.fitnessGoal || "fat_loss", equipment: "gym", duration: "45" });
  const [split, setSplit] = useState("ppl");
  const [muscles, setMuscles] = useState(["Chest","Shoulders","Triceps"]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const toggleMuscle = m => { setMuscles(p => p.includes(m) ? p.filter(x => x !== m) : [...p, m]); setSaved(false); };

  const generate = async () => {
    if (plan !== "pro" && generationsUsed >= FREE_LIMIT) { setShowUpgrade(true); return; }
    setLoading(true); setResult(null); setSaved(false);
    const splitLabel = SPLITS.find(s => s.id === split)?.label || split;
    const ctx = profile ? `Client: ${profile.name}, ${profile.age}yo ${profile.sex}, ${profile.weight}lbs, goal: ${profile.fitnessGoal?.replace("_"," ")}.` : "";
    const prompt = `${ctx}\nCreate a ${form.duration}-min ${splitLabel} session for a ${form.level} person.\nGoal: ${form.goal.replace("_"," ")} | Equipment: ${form.equipment} | Target muscles: ${muscles.join(", ")}\n\nFormat:\nSPLIT: ${splitLabel}\nTARGET MUSCLES: ${muscles.join(", ")}\n\nWARM-UP (5 min)\n[3 exercises]\n\nMAIN WORKOUT\n[Each exercise: name, sets×reps, rest, brief note on why it targets the listed muscles]\n\nCOOL-DOWN (5 min)\n[3 stretches for worked muscles]\n\nCOACH NOTE: Key advice for this session.`;
    const r = await callClaude([{ role: "user", content: prompt }], "You are a certified personal trainer. Create safe, effective, well-structured workouts. Always explain how each exercise targets the specified muscles. Be specific with sets, reps, and rest times.");
    setResult(r);
    await onGeneration();
    setLoading(false);
  };

  const saveplan = async () => {
    if (!result || saved) return;
    const splitLabel = SPLITS.find(s => s.id === split)?.label || split;
    const p = { type: "workout", title: `${splitLabel} — ${muscles.slice(0,2).join(" & ")}`, subtitle: `${form.level} · ${form.duration} min · ${form.goal.replace("_"," ")}`, content: result, date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}) };
    const { data, error } = await savePlan(userId, p);
    if (!error) {
      setSavedPlans(prev => [{ id: data?.[0]?.id || Date.now(), ...p }, ...prev]);
      setSaved(true);
    }
  };

  return (
    <div>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}
      <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:36, letterSpacing:2, margin:"0 0 20px" }}>WORKOUT <span style={{ color:A }}>GENERATOR</span></h2>
      <UsageBar used={generationsUsed} plan={plan} />

      <Card style={{ marginBottom:10 }}>
        <Label>Training Split</Label>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
          {SPLITS.map(s => (
            <button key={s.id} onClick={() => setSplit(s.id)} style={{ background:split===s.id?`${A}15`:"transparent", border:`1px solid ${split===s.id?A:BD}`, borderRadius:10, padding:"10px 12px", cursor:"pointer", textAlign:"left" }}>
              <p style={{ color:split===s.id?A:T1, fontSize:12, fontWeight:600, margin:"0 0 2px", fontFamily:"inherit" }}>{s.label}</p>
              <p style={{ color:T2, fontSize:10, margin:0, fontFamily:"inherit" }}>{s.days} · {s.desc}</p>
            </button>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom:10 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <Label>Target Muscle Groups</Label>
          <span style={{ color:muscles.length===0?"#ef4444":T2, fontSize:11 }}>{muscles.length===0?"Select at least one":`${muscles.length} selected`}</span>
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {MUSCLES.map(m => <MuscleChip key={m} label={m} active={muscles.includes(m)} onClick={() => toggleMuscle(m)} />)}
        </div>
        {muscles.length > 0 && <p style={{ color:T2, fontSize:11, margin:"10px 0 0", fontStyle:"italic" }}>Focus: {muscles.join(" · ")}</p>}
      </Card>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        {[
          { key:"level", label:"Fitness Level", opts:[["beginner","Beginner"],["intermediate","Intermediate"],["advanced","Advanced"]] },
          { key:"goal", label:"Goal", opts:[["fat_loss","Fat Loss"],["muscle_gain","Muscle Gain"],["strength","Strength"],["endurance","Endurance"]] },
          { key:"equipment", label:"Equipment", opts:[["gym","Full Gym"],["dumbbells","Dumbbells"],["home","Bodyweight"],["no_equipment","None"]] },
          { key:"duration", label:"Duration", opts:[["30","30 min"],["45","45 min"],["60","60 min"],["90","90 min"]] },
        ].map(f => (
          <Card key={f.key}>
            <Label>{f.label}</Label>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {f.opts.map(([v,l]) => <Chip key={v} label={l} active={form[f.key]===v} onClick={() => { setForm(p => ({...p,[f.key]:v})); setSaved(false); }} />)}
            </div>
          </Card>
        ))}
      </div>

      <Btn onClick={generate} disabled={loading||muscles.length===0} full>{loading?"Generating...":"Generate Workout Plan"}</Btn>
      <AIResult text={result} onSave={saveplan} saved={saved} />
    </div>
  );
}

// ─── MEAL PLANNER ────────────────────────────────────────────────────────────
function MealGen({ profile, userId, savedPlans, setSavedPlans, generationsUsed, plan, onGeneration }) {
  const snap = c => String(Math.round(c / 100) * 100);
  const [form, setForm] = useState({ calories: profile?.calorieGoal ? snap(profile.calorieGoal) : "2000", diet: "balanced", goal: profile?.fitnessGoal || "fat_loss", allergies: "" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const generate = async () => {
    if (plan !== "pro" && generationsUsed >= FREE_LIMIT) { setShowUpgrade(true); return; }
    setLoading(true); setResult(null); setSaved(false);
    const ctx = profile ? `Client: ${profile.name}, ${profile.age}yo ${profile.sex}, ${profile.weight}lbs.` : "";
    const note = form.allergies ? `Restrictions: ${form.allergies}.` : "";
    const prompt = `${ctx} Create a 1-day ${form.diet} meal plan: ${form.calories} kcal, goal: ${form.goal.replace("_"," ")}. ${note}\nInclude: breakfast, lunch, dinner, 1–2 snacks.\nFor each: name, key ingredients, macros (P/C/F/kcal).\nEnd with: Daily Totals.`;
    const r = await callClaude([{ role: "user", content: prompt }], "You are a registered dietitian. Create practical, balanced, delicious meal plans with accurate nutritional estimates.");
    setResult(r);
    await onGeneration();
    setLoading(false);
  };

  const saveplan = async () => {
    if (!result || saved) return;
    const p = { type: "meal", title: `${form.diet.replace("_"," ")} Meal Plan`, subtitle: `${form.calories} kcal · ${form.goal.replace("_"," ")}`, content: result, date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"}) };
    const { data, error } = await savePlan(userId, p);
    if (!error) {
      setSavedPlans(prev => [{ id: data?.[0]?.id || Date.now(), ...p }, ...prev]);
      setSaved(true);
    }
  };

  return (
    <div>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}
      <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:36, letterSpacing:2, margin:"0 0 20px" }}>MEAL <span style={{ color:A }}>PLANNER</span></h2>
      <UsageBar used={generationsUsed} plan={plan} />

      {profile?.calorieGoal && (
        <div style={{ background:`${A}12`, border:`1px solid ${A}35`, borderRadius:12, padding:"10px 14px", marginBottom:14 }}>
          <p style={{ color:A, fontSize:13, margin:0 }}>Your target: <strong>{profile.calorieGoal.toLocaleString()} kcal/day</strong> ({profile.tdee.toLocaleString()} TDEE {profile.fitnessGoal==="fat_loss"?"− 500":profile.fitnessGoal==="muscle_gain"?"+ 300":""})</p>
        </div>
      )}

      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
        <Card>
          <Label>Daily Calories</Label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {["1500","1800","2000","2200","2500"].map(c => <Chip key={c} label={`${c} kcal`} active={form.calories===c} onClick={() => setForm(p=>({...p,calories:c}))} />)}
          </div>
        </Card>
        <Card>
          <Label>Diet Style</Label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {[["balanced","Balanced"],["high_protein","High Protein"],["keto","Keto"],["vegetarian","Vegetarian"],["vegan","Vegan"],["mediterranean","Mediterranean"]].map(([v,l]) => (
              <Chip key={v} label={l} active={form.diet===v} onClick={() => setForm(p=>({...p,diet:v}))} />
            ))}
          </div>
        </Card>
        <Card>
          <Label>Goal</Label>
          <div style={{ display:"flex", gap:6 }}>
            {[["fat_loss","Fat Loss"],["muscle_gain","Muscle Gain"],["maintenance","Maintenance"]].map(([v,l]) => (
              <Chip key={v} label={l} active={form.goal===v} onClick={() => setForm(p=>({...p,goal:v}))} />
            ))}
          </div>
        </Card>
        <Card>
          <Label>Allergies / Restrictions (optional)</Label>
          <input value={form.allergies} onChange={e=>setForm(p=>({...p,allergies:e.target.value}))} placeholder="e.g. gluten, nuts, dairy..."
            style={{ background:S1, border:`1px solid ${BD}`, borderRadius:8, padding:"9px 12px", color:T1, fontSize:13, width:"100%", fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
        </Card>
      </div>

      <Btn onClick={generate} disabled={loading} full>{loading?"Planning...":"Generate Meal Plan"}</Btn>
      <AIResult text={result} onSave={saveplan} saved={saved} />
    </div>
  );
}

// ─── PROGRESS TRACKER ────────────────────────────────────────────────────────
function Progress({ profile, userId }) {
  const [entries, setEntries] = useState([]);
  const [newDate, setNewDate] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await getWeightLog(userId);
      if (data && data.length > 0) {
        setEntries(data.map(e => ({ id: e.id, date: e.date_label, weight: parseFloat(e.weight) })));
      } else if (profile?.weight) {
        // Seed with starting weight
        const today = new Date().toLocaleDateString("en-US",{month:"short",day:"numeric"});
        setEntries([{ date: "Start", weight: profile.weight }, { date: today, weight: profile.weight }]);
      }
      setLoading(false);
    };
    if (userId) load();
  }, [userId]);

  const add = async () => {
    if (!newDate.trim() || !newWeight) return;
    const w = parseFloat(newWeight);
    const { data } = await logWeight(userId, newDate.trim(), w);
    setEntries(e => [...e, { id: data?.[0]?.id, date: newDate.trim(), weight: w }]);
    setNewDate(""); setNewWeight("");
  };

  const remove = async (entry) => {
    if (entry.id) await deleteWeightEntry(entry.id);
    setEntries(e => e.filter(x => x !== entry));
  };

  const first = entries[0]?.weight || 0;
  const last = entries[entries.length - 1]?.weight || 0;
  const diff = (last - first).toFixed(1);
  const toGoal = profile?.goalWeight ? (last - profile.goalWeight).toFixed(1) : null;

  return (
    <div>
      <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:36, letterSpacing:2, margin:"0 0 20px" }}>PROGRESS <span style={{ color:A }}>TRACKER</span></h2>

      <div style={{ display:"grid", gridTemplateColumns:`repeat(${toGoal!==null?4:3},1fr)`, gap:10, marginBottom:18 }}>
        <StatCard label="Start" value={`${first} lbs`} />
        <StatCard label="Current" value={`${last} lbs`} />
        <StatCard label="Change" value={`${diff} lbs`} sub={parseFloat(diff)<0?"Great progress!":"Keep going!"} accentSub={parseFloat(diff)<0} />
        {toGoal!==null && <StatCard label="To Goal" value={`${Math.abs(parseFloat(toGoal)).toFixed(1)} lbs`} sub={parseFloat(toGoal)<=0?"Goal reached!":"remaining"} accentSub={parseFloat(toGoal)<=0} />}
      </div>

      <Card style={{ marginBottom:14 }}>
        <Label>Weight Trend</Label>
        {loading ? <p style={{ color:T2, fontSize:13, textAlign:"center", padding:"20px 0" }}>Loading...</p> : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={entries} margin={{ top:5, right:10, left:-24, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={BD} />
              <XAxis dataKey="date" tick={{ fill:T2, fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:T2, fontSize:10 }} axisLine={false} tickLine={false} domain={["auto","auto"]} />
              <Tooltip contentStyle={{ background:S1, border:`1px solid ${BD}`, borderRadius:8, color:T1, fontSize:12 }} labelStyle={{ color:T2 }} formatter={v=>[`${v} lbs`,"Weight"]} />
              <Line type="monotone" dataKey="weight" stroke={A} strokeWidth={2.5} dot={{ fill:A, r:4, strokeWidth:0 }} activeDot={{ r:6 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <Label>Log New Entry</Label>
        <div style={{ display:"flex", gap:8, marginBottom:14 }}>
          <input value={newDate} onChange={e=>setNewDate(e.target.value)} placeholder="Label (e.g. Apr 12)"
            style={{ flex:1, background:S1, border:`1px solid ${BD}`, borderRadius:8, padding:"9px 12px", color:T1, fontSize:13, fontFamily:"inherit", outline:"none" }} />
          <input value={newWeight} onChange={e=>setNewWeight(e.target.value)} type="number" placeholder="lbs"
            style={{ width:90, background:S1, border:`1px solid ${BD}`, borderRadius:8, padding:"9px 12px", color:T1, fontSize:13, fontFamily:"inherit", outline:"none" }} />
          <Btn onClick={add} disabled={!newDate.trim()||!newWeight}>Add</Btn>
        </div>
        <div style={{ maxHeight:140, overflowY:"auto" }}>
          {[...entries].reverse().map((e, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", borderBottom:`1px solid ${BD}`, fontSize:13 }}>
              <span style={{ color:T2 }}>{e.date}</span>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <span style={{ color:T1, fontWeight:500 }}>{e.weight} lbs</span>
                <button onClick={() => remove(e)} style={{ background:"transparent", border:"none", color:T2, fontSize:11, cursor:"pointer", fontFamily:"inherit", padding:"2px 6px" }}>×</button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ─── SAVED PLANS ─────────────────────────────────────────────────────────────
function Saved({ savedPlans, setSavedPlans, userId }) {
  const [view, setView] = useState(null);
  const [filter, setFilter] = useState("all");
  const filtered = savedPlans.filter(p => filter === "all" || p.type === filter);

  const handleDelete = async (id) => {
    await deletePlan(id);
    setSavedPlans(p => p.filter(x => x.id !== id));
    setView(null);
  };

  if (view) {
    const p = savedPlans.find(x => x.id === view);
    if (!p) { setView(null); return null; }
    return (
      <div>
        <button onClick={() => setView(null)} style={{ background:"transparent", border:`1px solid ${BD}`, borderRadius:8, padding:"6px 14px", color:T2, fontSize:12, cursor:"pointer", fontFamily:"inherit", marginBottom:20 }}>← Back to Saved</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:6 }}>
              <span style={{ background:p.type==="workout"?`${A}20`:"#3b82f620", color:p.type==="workout"?A:"#60a5fa", fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4, textTransform:"uppercase" }}>{p.type==="workout"?"Workout":"Meal Plan"}</span>
              <span style={{ color:T2, fontSize:11 }}>{p.date}</span>
            </div>
            <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:30, letterSpacing:1.5, margin:"0 0 4px" }}>{p.title}</h2>
            <p style={{ color:T2, fontSize:12, margin:0 }}>{p.subtitle}</p>
          </div>
          <button onClick={() => handleDelete(p.id)} style={{ background:"transparent", border:`1px solid #e5555540`, borderRadius:8, padding:"6px 12px", color:"#e55555", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>Delete</button>
        </div>
        <Card><p style={{ color:T1, fontSize:13, lineHeight:1.75, margin:0, whiteSpace:"pre-wrap" }}>{p.content}</p></Card>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:36, letterSpacing:2, margin:"0 0 6px" }}>SAVED <span style={{ color:A }}>PLANS</span></h2>
      <p style={{ color:T2, fontSize:13, margin:"0 0 20px" }}>Your generated workouts and meal plans — saved to your account.</p>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[["all",`All (${savedPlans.length})`],["workout",`Workouts (${savedPlans.filter(p=>p.type==="workout").length})`],["meal",`Meals (${savedPlans.filter(p=>p.type==="meal").length})`]].map(([v,l]) => (
          <Chip key={v} label={l} active={filter===v} onClick={() => setFilter(v)} />
        ))}
      </div>
      {filtered.length === 0 ? (
        <Card style={{ textAlign:"center", padding:"40px 20px" }}>
          <p style={{ color:T2, fontSize:14, margin:"0 0 6px" }}>No saved plans yet</p>
          <p style={{ color:T2, fontSize:12, margin:0 }}>Generate a workout or meal plan and tap "Save Plan".</p>
        </Card>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {filtered.map(p => {
            const [h, sH] = useState(false);
            return (
              <button key={p.id} onClick={() => setView(p.id)}
                onMouseEnter={() => sH(true)} onMouseLeave={() => sH(false)}
                style={{ background:S2, border:`1px solid ${h?A:BD}`, borderRadius:14, padding:"14px 16px", cursor:"pointer", textAlign:"left", transition:"border-color 0.12s", width:"100%" }}>
                <div style={{ display:"flex", justifyContent:"space-between" }}>
                  <div>
                    <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                      <span style={{ background:p.type==="workout"?`${A}20`:"#3b82f620", color:p.type==="workout"?A:"#60a5fa", fontSize:10, fontWeight:600, padding:"2px 8px", borderRadius:4, textTransform:"uppercase" }}>{p.type==="workout"?"Workout":"Meal Plan"}</span>
                      <span style={{ color:T2, fontSize:11 }}>{p.date}</span>
                    </div>
                    <p style={{ color:T1, fontWeight:600, fontSize:14, margin:"0 0 3px", fontFamily:"inherit" }}>{p.title}</p>
                    <p style={{ color:T2, fontSize:12, margin:0, fontFamily:"inherit" }}>{p.subtitle}</p>
                  </div>
                  <span style={{ color:T2, fontSize:18, marginLeft:12 }}>›</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PROFILE SETTINGS ────────────────────────────────────────────────────────
function Settings({ profile, userId, onProfileUpdate, onSignOut }) {
  const [form, setForm] = useState({ weight: profile?.weight || "", goalWeight: profile?.goalWeight || "", activity: profile?.activity || "moderate" });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    const updates = { weight: parseFloat(form.weight), goal_weight: parseFloat(form.goalWeight), activity: form.activity };
    const tdee = calcTDEE({ ...profile, weight: parseFloat(form.weight), activity: form.activity });
    const calorieGoal = profile.fitnessGoal === "fat_loss" ? tdee - 500 : profile.fitnessGoal === "muscle_gain" ? tdee + 300 : tdee;
    await upsertProfile(userId, { ...updates, tdee, calorie_goal: calorieGoal });
    onProfileUpdate({ ...profile, weight: parseFloat(form.weight), goalWeight: parseFloat(form.goalWeight), activity: form.activity, tdee, calorieGoal });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <h2 style={{ fontFamily:"'Bebas Neue', cursive", fontSize:36, letterSpacing:2, margin:"0 0 20px" }}>YOUR <span style={{ color:A }}>PROFILE</span></h2>
      <Card style={{ marginBottom:10 }}>
        <Label>Account</Label>
        <p style={{ color:T1, fontSize:14, margin:"0 0 4px" }}>{profile?.name}</p>
        <p style={{ color:T2, fontSize:12, margin:0 }}>Plan: <span style={{ color: profile?.plan === "pro" ? A : T2 }}>{profile?.plan === "pro" ? "Pro" : "Free"}</span>{profile?.plan !== "pro" && ` · ${Math.max(FREE_LIMIT - (profile?.generationsUsed || 0), 0)} generations remaining`}</p>
      </Card>
      <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
        <Card>
          <Label>Current Weight (lbs)</Label>
          <TextInput value={form.weight} onChange={e => setForm(f => ({...f, weight: e.target.value}))} placeholder="e.g. 185" type="number" />
        </Card>
        <Card>
          <Label>Goal Weight (lbs)</Label>
          <TextInput value={form.goalWeight} onChange={e => setForm(f => ({...f, goalWeight: e.target.value}))} placeholder="e.g. 165" type="number" />
        </Card>
        <Card>
          <Label>Activity Level</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {[["sedentary","Sedentary"],["light","Lightly Active"],["moderate","Moderately Active"],["active","Very Active"],["very","Extremely Active"]].map(([v,l]) => (
              <Chip key={v} label={l} active={form.activity===v} onClick={() => setForm(f=>({...f,activity:v}))} />
            ))}
          </div>
        </Card>
      </div>
      <div style={{ display:"flex", gap:10, marginBottom:24 }}>
        <Btn onClick={save} disabled={saving} full>{saving?"Saving...":(saved?"✓ Saved":"Update Profile")}</Btn>
      </div>
      {profile?.plan !== "pro" && (
        <Card style={{ marginBottom:16, background:`${A}08`, border:`1px solid ${A}30` }}>
          <p style={{ color:A, fontFamily:"'Bebas Neue', cursive", fontSize:24, margin:"0 0 6px", letterSpacing:1 }}>UPGRADE TO PRO</p>
          <p style={{ color:T2, fontSize:13, margin:"0 0 14px", lineHeight:1.6 }}>Unlimited AI generations, full history, priority support. $12/month.</p>
          <Btn onClick={() => window.open("https://buy.stripe.com/your-link","_blank")} full>Upgrade Now →</Btn>
        </Card>
      )}
      <button onClick={onSignOut} style={{ background:"transparent", border:`1px solid #e5555540`, borderRadius:10, padding:"10px 0", color:"#e55555", fontSize:13, cursor:"pointer", fontFamily:"inherit", width:"100%" }}>Sign Out</button>
    </div>
  );
}

// ─── ROOT ────────────────────────────────────────────────────────────────────
export default function FitAI() {
  const [screen, setScreen] = useState("loading");
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [savedPlans, setSavedPlans] = useState([]);
  const [tab, setTab] = useState("home");
  const [generationsUsed, setGenerationsUsed] = useState(0);

  // Load Google Fonts
  useEffect(() => {
    const l = document.createElement("link");
    l.href = "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;600&display=swap";
    l.rel = "stylesheet";
    document.head.appendChild(l);
  }, []);

  // Session restoration — runs once on mount
  useEffect(() => {
    const { data: { subscription } } = onAuthChange(async (event, session) => {
      if (session?.user) {
        const u = session.user;
        setUser({ id: u.id, email: u.email, name: u.user_metadata?.name || u.email.split("@")[0] });
        // Load profile from DB
        const { data: p } = await getProfile(u.id);
        if (p) {
          setProfile({
            name: u.user_metadata?.name || u.email.split("@")[0],
            age: p.age, sex: p.sex, heightFt: p.height_ft, heightIn: p.height_in,
            weight: p.weight, goalWeight: p.goal_weight, fitnessGoal: p.fitness_goal,
            activity: p.activity, tdee: p.tdee, calorieGoal: p.calorie_goal,
            plan: p.plan || "free", generationsUsed: p.generations_used || 0,
          });
          setGenerationsUsed(p.generations_used || 0);
          // Load saved plans
          const { data: plans } = await getSavedPlans(u.id);
          if (plans) setSavedPlans(plans.map(x => ({ id: x.id, type: x.type, title: x.title, subtitle: x.subtitle, content: x.content, date: new Date(x.created_at).toLocaleDateString("en-US",{month:"short",day:"numeric"}) })));
          setScreen("app");
        } else {
          setScreen("onboarding");
        }
      } else {
        setScreen("auth");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleAuth = useCallback((u) => {
    setUser(u);
    // onAuthStateChange will fire and handle profile loading
  }, []);

  const handleOnboardingComplete = useCallback(async (formData) => {
    const dbData = {
      age: formData.age, sex: formData.sex, height_ft: parseInt(formData.heightFt),
      height_in: parseInt(formData.heightIn || 0), weight: formData.weight,
      goal_weight: formData.goalWeight, fitness_goal: formData.fitnessGoal,
      activity: formData.activity, tdee: formData.tdee, calorie_goal: formData.calorieGoal,
      plan: "free", generations_used: 0,
    };
    await upsertProfile(user.id, dbData);
    setProfile({ ...formData, name: user.name, plan: "free", generationsUsed: 0 });
    setScreen("app");
  }, [user]);

  const handleGeneration = useCallback(async () => {
    const next = generationsUsed + 1;
    setGenerationsUsed(next);
    await incrementGenerations(user.id);
  }, [generationsUsed, user]);

  const handleSignOut = async () => {
    await sbSignOut();
    setUser(null); setProfile(null); setSavedPlans([]); setTab("home"); setGenerationsUsed(0);
  };

  const planTier = profile?.plan || "free";

  if (screen === "loading") {
    return (
      <div style={{ minHeight:"100vh", background:BG, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <p style={{ fontFamily:"'Bebas Neue', cursive", fontSize:40, color:A, letterSpacing:4 }}>FITAI</p>
      </div>
    );
  }

  if (screen === "auth") return <AuthScreen onAuth={handleAuth} />;
  if (screen === "onboarding") return <OnboardingScreen onComplete={handleOnboardingComplete} />;

  const tabs = [
    { id:"home", label:"Home" },
    { id:"chat", label:"Coach" },
    { id:"workout", label:"Workout" },
    { id:"meals", label:"Meals" },
    { id:"progress", label:"Progress" },
    { id:"saved", label: savedPlans.length > 0 ? `Saved (${savedPlans.length})` : "Saved" },
    { id:"settings", label:"Profile" },
  ];

  const sharedProps = { profile, userId: user?.id, savedPlans, setSavedPlans, generationsUsed, plan: planTier, onGeneration: handleGeneration };

  return (
    <div style={{ background:BG, minHeight:"100vh", color:T1, fontFamily:"'DM Sans', system-ui, sans-serif" }}>
      <div style={{ background:S1, borderBottom:`1px solid ${BD}`, position:"sticky", top:0, zIndex:10 }}>
        <div style={{ maxWidth:880, margin:"0 auto", padding:"0 16px", display:"flex", alignItems:"center", height:52, gap:4 }}>
          <span style={{ fontFamily:"'Bebas Neue', cursive", fontSize:22, color:A, letterSpacing:3, marginRight:8, flexShrink:0 }}>FITAI</span>
          <div style={{ display:"flex", gap:2, flex:1, flexWrap:"wrap" }}>
            {tabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                style={{ background:tab===t.id?A:"transparent", color:tab===t.id?BG:T2, border:"none", padding:"5px 10px", borderRadius:8, fontSize:12, fontWeight:tab===t.id?600:400, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                {t.label}
              </button>
            ))}
          </div>
          {planTier !== "pro" && (
            <button onClick={() => window.open("https://buy.stripe.com/your-link","_blank")}
              style={{ background:`${A}20`, border:`1px solid ${A}50`, borderRadius:8, padding:"4px 10px", color:A, fontSize:11, fontWeight:600, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
              Pro ✦
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth:880, margin:"0 auto", padding:"28px 16px 80px" }}>
        {tab==="home"     && <Home profile={profile} setTab={setTab} savedPlans={savedPlans} />}
        {tab==="chat"     && <Coach {...sharedProps} />}
        {tab==="workout"  && <WorkoutGen {...sharedProps} />}
        {tab==="meals"    && <MealGen {...sharedProps} />}
        {tab==="progress" && <Progress profile={profile} userId={user?.id} />}
        {tab==="saved"    && <Saved savedPlans={savedPlans} setSavedPlans={setSavedPlans} userId={user?.id} />}
        {tab==="settings" && <Settings profile={{ ...profile, generationsUsed }} userId={user?.id} onProfileUpdate={setProfile} onSignOut={handleSignOut} />}
      </div>

      <div style={{ background:S1, borderTop:`1px solid ${BD}`, padding:"12px 20px", textAlign:"center", position:"fixed", bottom:0, left:0, right:0 }}>
        <p style={{ color:T2, fontSize:10, margin:0 }}>FitAI is not a substitute for professional medical advice. Consult a doctor before starting any new diet or exercise program.</p>
      </div>
    </div>
  );
}
