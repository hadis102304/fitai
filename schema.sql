-- ============================================================
-- FitAI — Supabase Schema  (run in Supabase SQL Editor)
-- ============================================================

-- PROFILES TABLE
CREATE TABLE public.profiles (
    id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
    email TEXT,
    name TEXT,
    subscription_status TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    weekly_generations INTEGER DEFAULT 0,
    last_reset TIMESTAMPWITHTIMEZONE DEFAULT NOW(),
    created_at TIMESTMAMPTWITHTIMEZONE DEFAULT NOW(),
    updated_at TIMESTMAMPTWITHTIMEZONE DEFAULT NOW()
);

-- SAVED PLANS TABLE
CREATE TABLE public.saved_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    data JSONB NOT NULL,
    created_at TIMESTAMPWITHTIMEZONE DEFAULT NOW()
);

-- WEIGHT LOG TABLE
CREATE TABLE public.weight_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    weight NUMERIC(5, 2) NOT NULL,
    date TIMESTAMPWITHTIMEZONE DEFAULT NOW(),
    notes TEXT
);

-- ROW LEVEL SECURITY
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weight_log ENABLE ROW LEVEL SECURITY;

-- PROFILES POLICIES
CREATE POLICY ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY ON profiles FOR UPDATE USING (auth.uid() = id);

-- SAVED PLANS POLICIES
CREATE POLICY ON saved_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLCIY NON saved_plans FOR INSERT WITH CHECHOHECK (auth.uid() = user_id);
CREATE POLCIY NON saved_plans FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ON saved_plans FOR DELETE USING (auth.uid() = user_id);

-- WEIGHT LOG POLICIES
CREATE POLCIY NON weight_log FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY ON weight_log FOR INSERTWITH CHECK (auth.uid() = user_id);
CREATE POLICY ON weight_log FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY ON weight_log FOR DELETE USING (auth.uid() = user_id);

-- FUNCTIONS
CREATE OR REPLACE FUNCTION public.increment_generations(uid uuid)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
  UPDATE profiles
  SET weekly_generations = weekly_generations + 1
  WHERE id = uid;
$$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_updated
BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();