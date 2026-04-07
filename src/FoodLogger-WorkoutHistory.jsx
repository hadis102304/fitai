// ─────────────────────────────────────────────────────────────────────────────
// PASTE THESE TWO COMPONENTS INTO App.jsx
// Add 'food' and 'history' to the tabs array in the ROOT component
// Add DB helpers to supabase.js (shown at bottom of this file)
// ─────────────────────────────────────────────────────────────────────────────

// ─── FOOD LOGGER ─────────────────────────────────────────────────────────────
// Add to supabase.js:
// export const getFoodLog = (userId, date) =>
//   supabase.from('food_log').select('*').eq('user_id', userId).eq('log_date', date).order('created_at');
// export const addFoodEntry = (userId, entry) =>
//   supabase.from('food_log').insert({ user_id: userId, ...entry });
// export const deleteFoodEntry = (id) =>
//   supabase.from('food_log').delete().eq('id', id);

import { getFoodLog, addFoodEntry, deleteFoodEntry } from "./lib/supabase";

function FoodLogger({ profile, userId, generationsUsed, plan, onGeneration }) {
  const A = "#C5F135", BG = "#080808", S1 = "#111111", S2 = "#181818", BD = "#282828", T1 = "#FFFFFF", T2 = "#888888";
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);

  const load = async (d) => {
    setLoading(true);
    const { data } = await getFoodLog(userId, d);
    setEntries(data || []);
    setLoading(false);
  };

  useEffect(() => { if (userId) load(date); }, [userId, date]);

  const addManual = async () => {
    if (!form.name || !form.calories) return;
    const entry = { log_date: date, name: form.name, calories: parseInt(form.calories), protein: parseFloat(form.protein || 0), carbs: parseFloat(form.carbs || 0), fat: parseFloat(form.fat || 0) };
    const { data } = await addFoodEntry(userId, entry);
    setEntries(e => [...e, { id: data?.[0]?.id || Date.now(), ...entry }]);
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  };

  const parseWithAI = async () => {
    if (!aiInput.trim()) return;
    if (plan !== "pro" && generationsUsed >= 10) { setShowUpgrade(true); return; }
    setAiLoading(true);
    const reply = await callClaude([{ role: "user", content: `Parse this food into nutritional data. Return ONLY a JSON array (no markdown, no text) of objects with: name, calories, protein, carbs, fat (all numbers). Input: "${aiInput}"` }],
      "You are a nutrition expert. Parse food descriptions into accurate nutritional data. Return only valid JSON arrays with no extra text.");
    try {
      const parsed = JSON.parse(reply.trim());
      for (const item of parsed) {
        const entry = { log_date: date, name: item.name, calories: item.calories || 0, protein: item.protein || 0, carbs: item.carbs || 0, fat: item.fat || 0 };
        const { data } = await addFoodEntry(userId, entry);
        setEntries(e => [...e, { id: data?.[0]?.id || Date.now(), ...entry }]);
      }
      setAiInput("");
      await onGeneration();
    } catch { alert("Couldn't parse that — try being more specific."); }
    setAiLoading(false);
  };

  const remove = async (id) => {
    await deleteFoodEntry(id);
    setEntries(e => e.filter(x => x.id !== id));
  };

  const totals = entries.reduce((acc, e) => ({ cal: acc.cal + (e.calories || 0), p: acc.p + (e.protein || 0), c: acc.c + (e.carbs || 0), f: acc.f + (e.fat || 0) }), { cal: 0, p: 0, c: 0, f: 0 });
  const goal = profile?.calorieGoal || 2000;
  const pct = Math.min(Math.round((totals.cal / goal) * 100), 100);
  const remaining = goal - totals.cal;

  const iStyles = { background: S1, border: `1px solid ${BD}`, borderRadius: 8, padding: "9px 12px", color: T1, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };

  return (
    <div>
      {showUpgrade && <UpgradePrompt onClose={() => setShowUpgrade(false)} />}
      <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, letterSpacing: 2, margin: "0 0 20px" }}>FOOD {span style={{ color: A }}>LOGGER</span></h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...iStyles, width: "auto" }} />
        <span style={{ color: T2, fontSize: 12 }}>{date === today ? "Today" : ""}</span>
      </div>

      {/* Summary ring */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 3fr", gap: 20, alignItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, color: remaining >= 0 ? A : "#ef4444", margin: 0, letterSpacing: 1 }}>{totals.cal.toLocaleString()}</p>
            <p style={{ color: T2, fontSize: 11, margin: 0 }}>of {goal.toLocaleString()} kcal</p>
          </div>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: T2, fontSize: 11 }}>{pct}% of daily goal</span>
              <span style={{ color: remaining >= 0 ? A : "#ef4444", fontSize: 11 }}>{remaining >= 0 ? `${remaining} remaining` : `${Math.abs(remaining)} over`}</span>
            </div>
            <div style={{ background: BD, borderRadius: 4, height: 6 }}>
              <div style={{ background: remaining >= 0 ? A : "#ef4444", borderRadius: 4, height: 6, width: `${pct}%`, transition: "width 0.3s" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
              {[["Protein", `${Math.round(totals.p)}g`, "#60a5fa"], ["Carbs", `${Math.round(totals.c)}g`, "#f59e0b"], ["Fat", `${Math.round(totals.f)}g`, "#f87171"]].map(([l, v, c]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <p style={{ color: c, fontFamily: "'Bebas Neue', cursive", fontSize: 18, margin: "0 0 2px" }}>{v}</p>
                  <p style={{ color: T2, fontSize: 10 }}>{l}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* AI parse */}
      <Card style={{ marginBottom: 12 }}>
        <Label>Log with AI</Label>
        <p style={{ color: T2, fontSize: 12, margin: "0 0 10px" }}>Describe what you ate — AI parses the macros automatically.</p>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="e.g. 2 scrambled eggs with toast and OJ"
            style={{ ...iStyles, flex: 1 }} onKeyDown={e => e.key === "Enter" && parseWithAI()} />
          <Btn onClick={parseWithAI} disabled={aiLoading || !aiInput.trim()} sm>{aiLoading ? "..." : "Parse"}</Btn>
        </div>
      </Card>

      {/* Manual entry */}
      <Card style={{ marginBottom: 16 }}>
        <Label>Add Manually</Label>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 6, marginBottom: 8 }}>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Food name" style={{ ...iStyles }} />
          <input value={form.calories} onChange={e => setForm(f => ({ ...f, calories: e.target.value }))} placeholder="kcal" type="number" style={{ ...iStyles }} />
          <input value={form.protein} onChange={e => setForm(f => ({ ...f, protein: e.target.value }))} placeholder="P(g)" type="number" style={{ ...iStyles }} />
          <input value={form.carbs} onChange={e => setForm(f => ({ ...f, carbs: e.target.value }))} placeholder="C(g)" type="number" style={{ ...iStyles }} />
          <input value={form.fat} onChange={e => setForm(f => ({ ...f, fat: e.target.value }))} placeholder="F(g)" type="number" style={{ ...iStyles }} />
        </div>
        <Btn onClick={addManual} disabled={!form.name || !form.calories} sm>Add Entry</Btn>
      </Card>

      {/* Log */}
      <Card>
        <Label>Today's Log {loading && <span style={{ color: T2, fontSize: 10, fontWeight: 400 }}>Loading...</span>}</Label>
        {entries.length === 0 && !loading && <p style={{ color: T2, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No entries yet. Start logging your meals above.</p>}
        {entries.map((e, i) => (
          <div key={e.id || i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${BD}` }}>
            <div>
              <p style={{ color: T1, fontSize: 13, fontWeight: 500, margin: "0 0 2px" }}>{e.name}</p>
              <p style={{ color: T2, fontSize: 11, margin: 0 }}>P: {e.protein}g · C: {e.carbs}g · F: {e.fat}g</p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: A, fontFamily: "'Bebas Neue', cursive", fontSize: 18 }}>{e.calories}</span>
              <button onClick={() => remove(e.id)} style={{ background: "transparent", border: "none", color: T2, cursor: "pointer", fontSize: 14 }}>×</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── WORKOUT HISTORY LOGGER ───────────────────────────────────────────────────
// Add to supabase.js:
// export const getWorkoutHistory = (userId) =>
//   supabase.from('workout_history').select('*').eq('user_id', userId).order('logged_at', { ascending: false }).limit(50);
// export const logWorkoutSession = (userId, session) =>
//   supabase.from('workout_history').insert({ user_id: userId, ...session });
// export const deleteWorkoutSession = (id) =>
//   supabase.from('workout_history').delete().eq('id', id);

import { getWorkoutHistory, logWorkoutSession, deleteWorkoutSession } from "./lib/supabase";

function WorkoutHistory({ userId }) {
  const A = "#C5F135", S1 = "#111111", S2 = "#181818", BD = "#282828", T1 = "#FFFFFF", T2 = "#888888";
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ split: "", muscles: [], duration: "", notes: "", date: new Date().toISOString().split("T")[0] });

  const MUSCLES = ["Chest","Back","Shoulders","Biceps","Triceps","Quads","Hamstrings","Glutes","Core","Calves"];

  useEffect(() => {
    const load = async () => {
      const { data } = await getWorkoutHistory(userId);
      setHistory(data || []);
      setLoading(false);
    };
    if (userId) load();
  }, [userId]);

  const save = async () => {
    if (!form.split) return;
    const session = { split: form.split, muscles: form.muscles.join(", "), duration: parseInt(form.duration) || 0, notes: form.notes, logged_at: form.date };
    const { data } = await logWorkoutSession(userId, session);
    setHistory(h => [{ id: data?.[0]?.id || Date.now(), ...session }, ...h]);
    setForm({ split: "", muscles: [], duration: "", notes: "", date: new Date().toISOString().split("T")[0] });
    setAdding(false);
  };

  const remove = async (id) => {
    await deleteWorkoutSession(id);
    setHistory(h => h.filter(x => x.id !== id));
  };

  const toggleMuscle = m => setForm(f => ({ ...f, muscles: f.muscles.includes(m) ? f.muscles.filter(x => x !== m) : [...f.muscles, m] }));

  const iStyles = { background: S1, border: `1px solid ${BD}`, borderRadius: 8, padding: "9px 12px", color: T1, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", width: "100%" };

  const streak = (() => {
    if (!history.length) return 0;
    const dates = [...new Set(history.map(h => h.logged_at?.split("T")[0]))].sort().reverse();
    let count = 0;
    const now = new Date();
    for (let i = 0; i < dates.length; i++) {
      const d = new Date(dates[i]);
      const diff = Math.floor((now - d) / 86400000);
      if (diff <= i + 1) count++;
      else break;
    }
    return count;
  })();

  return (
    <div>
      <h2 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 36, letterSpacing: 2, margin: "0 0 20px" }}>WORKOUT <span style={{ color: A }}>HISTORY</span></h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginBottom: 16 }}>
        <StatCard label="Total Sessions" value={String(history.length)} />
        <StatCard label="This Month" value={String(history.filter(h => new Date(h.logged_at) > new Date(new Date().getFullYear(), new Date().getMonth(), 1)).length)} />
        <StatCard label="Current Streak" value={`${streak} days`} accentSub sub={streak > 0 ? "Keep going!" : "Log a workout"} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <Btn onClick={() => setAdding(a => !a)} full outline>{adding ? "Cancel" : "+ Log a Workout"}</Btn>
      </div>

      {adding && (
        <Card style={{ marginBottom: 16 }}>
          <Label>Log Workout Session</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <p style={{ color: T2, fontSize: 11, margin: "0 0 6px" }}>Date</p>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={iStyles} />
              </div>
              <div>
                <p style={{ color: T2, fontSize: 11, margin: "0 0 6px" }}>Duration (min)</p>
                <input value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} placeholder="e.g. 45" type="number" style={iStyles} />
              </div>
            </div>
            <div>
              <p style={{ color: T2, fontSize: 11, margin: "0 0 6px" }}>Split / Workout Type</p>
              <input value={form.split} onChange={e => setForm(f => ({ ...f, split: e.target.value }))} placeholder="e.g. Push Day, Full Body, Chest + Triceps" style={iStyles} />
            </div>
            <div>
              <p style={{ color: T2, fontSize: 11, margin: "0 0 6px" }}>Muscles Worked</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {MUSCLES.map(m => (
                  <button key={m} onClick={() => toggleMuscle(m)} style={{ background: form.muscles.includes(m) ? `${A}20` : "transparent", color: form.muscles.includes(m) ? A : T2, border: `1px solid ${form.muscles.includes(m) ? A : BD}`, borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <p style={{ color: T2, fontSize: 11, margin: "0 0 6px" }}>Notes (optional)</p>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="How did it go? PRs, energy, anything notable..."
                style={{ ...iStyles, minHeight: 72, resize: "vertical" }} />
            </div>
            <Btn onClick={save} disabled={!form.split} full>Save Session</Btn>
          </div>
        </Card>
      )}

      <Card>
        <Label>Session Log</Label>
        {loading && <p style={{ color: T2, fontSize: 13, textAlign: "center", padding: "20px 0" }}>Loading...</p>}
        {!loading && history.length === 0 && <p style={{ color: T2, fontSize: 13, textAlign: "center", padding: "20px 0" }}>No sessions yet. Log your first workout above.</p>}
        {history.map((s, i) => (
          <div key={s.id || i} style={{ padding: "12px 0", borderBottom: `1px solid ${BD}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ color: T1, fontWeight: 600, fontSize: 14 }}>{s.split}</span>
                  {s.duration > 0 && <span style={{ color: T2, fontSize: 11 }}>{s.duration} min</span>}
                </div>
                {s.muscles && <p style={{ color: A, fontSize: 11, margin: "0 0 4px" }}>{s.muscles}</p>}
                {s.notes && <p style={{ color: T2, fontSize: 12, margin: 0, lineHeight: 1.5 }}>{s.notes}</p>}
                <p style={{ color: T2, fontSize: 11, margin: "6px 0 0" }}>{new Date(s.logged_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>
              </div>
              <button onClick={() => remove(s.id)} style={{ background: "transparent", border: "none", color: T2, cursor: "pointer", fontSize: 14, marginLeft: 12 }}>×</button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── ADDITIONAL SCHEMA (add to schema.sql) ───────────────────────────────────
/*
create table public.food_log (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  log_date    date not null,
  name        text not null,
  calories    int default 0,
  protein     numeric default 0,
  carbs       numeric default 0,
  fat         numeric default 0,
  created_at  timestamptz default now()
);
alter table public.food_log enable row level security;
create policy "own food select" on public.food_log for select using (auth.uid() = user_id);
create policy "own food insert" on public.food_log for insert with check (auth.uid() = user_id);
create policy "own food delete" on public.food_log for delete using (auth.uid() = user_id);

create table public.workout_history (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users on delete cascade not null,
  split       text not null,
  muscles     text,
  duration    int default 0,
  notes       text,
  logged_at   date default current_date
);
alter table public.workout_history enable row level security;
create policy "own history select" on public.workout_history for select using (auth.uid() = user_id);
create policy "own history insert" on public.workout_history for insert with check (auth.uid() = user_id);
create policy "own history delete" on public.workout_history for delete using (auth.uid() = user_id);
*/
