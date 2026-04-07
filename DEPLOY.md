# FitAI — Go Live in 5 Steps

Everything is production-ready. No code changes needed. Just follow these steps.

---

## Step 1 — Install dependencies

```bash
npm install
```

---

## Step 2 — Set up Supabase (5 min)

1. Go to **supabase.com** → New Project → name it `fitai`
2. Wait ~2 min for it to spin up
3. Go to **SQL Editor** → New query → paste the full contents of `schema.sql` → click **Run**
4. Go to **Settings → API** → copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public key** → `VITE_SUPABASE_ANON_KEY`
5. Copy `.env.example` to `.env` and paste those two values in

---

## Step 3 — Enable Google Sign-In (optional, 5 min)

1. Supabase → **Authentication → Providers → Google** → Enable
2. Follow the Google OAuth setup (create OAuth client at console.cloud.google.com)
3. Add your Vercel URL as an authorized redirect URI: `https://your-app.vercel.app`
4. That's it — the button is already wired in the app

---

## Step 4 — Add Stripe payment link (optional)

1. Go to **stripe.com** → Products → Create product → "FitAI Pro" → $12/month
2. Create a Payment Link for it
3. In `src/App.jsx`, replace `https://buy.stripe.com/your-link` (appears 3 times) with your actual Stripe Payment Link URL
4. To auto-upgrade users after payment, set up a Stripe webhook → Supabase Edge Function that sets `plan = 'pro'` in the profiles table

---

## Step 5 — Deploy to Vercel

```bash
# Push to GitHub first
git init
git add .
git commit -m "FitAI v1.0"
git remote add origin https://github.com/your-username/fitai.git
git push -u origin main
```

Then in Vercel:
1. **New Project** → import your GitHub repo
2. Framework: **Vite** (auto-detected)
3. **Environment Variables** → add:
   - `VITE_SUPABASE_URL`  → your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` → your anon key
4. **Deploy** → you're live ✗

---

## What's fully working out of the box

- **Auth** — email/password + Google Sign-In, session restored on page refresh
- **Onboarding** — included in app, completed once per account
- **AI Coach** — knows user's name, weight, goal, TDEE. Personalized from first message
- **Workout Generator** — split selector, muscle targeting, saves to Supabase
- **Meal Planner** — pre-filled with user's calorie target, saves to Supabase
- **Progress Tracker** — weight log persisted to Supabase, line chart
- **Saved Plans** — loaded from Supabase on login, available across devices
- **Free tier limits** — included in app, upgrade prompt shown
- **Pro upgrade UI** — upgrade button in nav + settings, links to Stripe
- **Profile settings** — update weight, goal weight, activity level anytime
- **Medical disclaimer** — fixed footer on every screen
- **Sign out** — clears all state, returns to auth screen

---

## File structure

```
fitai/
├── src/
│   ├── App.jsx          ← Full app (auth, tabs, all features)
│   ├── main.jsx         ← React entry point
│   └── lib/
│       └── supabase.js  ← Supabase client + all DB helpers
├── schema.sql           ← Run this in Supabase SQL Editor
├── index.html
├── package.json
├── vite.config.js
├── .env.example        ← Copy to .env
└── .env                ← Your keys (never commit this — add to .gitignore)
```

---

## Monthly generation reset

Add this to your `.gitignore`:
```
.env
node_modules
dist
```

To reset free-tier generation counts on the 1st of each month, enable the pg_cron extension in Supabase and uncomment the last two lines in `schema.sql`.
