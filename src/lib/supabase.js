import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ── Auth ──────────────────────────────────────────────────────
export const signUp = (email, password, name) =>
  supabase.auth.signUp({ email, password, options: { data: { name } } });

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signInGoogle = () =>
  supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });

export const signOut = () => supabase.auth.signOut();

export const onAuthChange = (cb) => supabase.auth.onAuthStateChange(cb);

// ── Profile ───────────────────────────────────────────────────
export const getProfile = (userId) =>
  supabase.from("profiles").select("*").eq("id", userId).single();

export const upsertProfile = (userId, data) =>
  supabase.from("profiles").upsert({ id: userId, updated_at: new Date().toISOString(), ...data });

export const incrementGenerations = (userId) =>
  supabase.rpc("increment_generations", { uid: userId });

// ── Saved Plans ───────────────────────────────────────────────
export const getSavedPlans = (userId) =>
  supabase.from("saved_plans").select("*").eq("user_id", userId).order("created_at", { ascending: false });

export const savePlan = (userId, plan) =>
  supabase.from("saved_plans").insert({ user_id: userId, ...plan });

export const deletePlan = (planId) =>
  supabase.from("saved_plans").delete().eq("id", planId);

// ── Weight Log ────────────────────────────────────────────────
export const getWeightLog = (userId) =>
  supabase.from("weight_log").select("*").eq("user_id", userId).order("logged_at", { ascending: true });

export const logWeight = (userId, dateLabel, weight) =>
  supabase.from("weight_log").insert({ user_id: userId, date_label: dateLabel, weight });

export const deleteWeightEntry = (entryId) =>
  supabase.from("weight_log").delete().eq("id", entryId);
