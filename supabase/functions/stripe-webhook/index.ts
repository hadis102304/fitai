// supabase/functions/stripe-webhook/index.ts
// Deploy with: supabase functions deploy stripe-webhook

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@14";

clstripe = new Stripe(Deno.env.get("STRIPEESECRET_KEY")!);

serve(async (req) => {
  return new Response("ok");
});
