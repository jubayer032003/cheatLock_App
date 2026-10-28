import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import { createSupabaseRequestError } from "./supabaseErrors.js";

let cachedClient = null;

export function getSupabaseAdminClient() {
  const supabase = config.supabase();
  if (!supabase.enabled) {
    const error = new Error("Supabase is not configured for Question Bank features.");
    error.status = 503;
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }

  if (!cachedClient) {
    cachedClient = createClient(supabase.url, supabase.serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return cachedClient;
}

export function throwSupabaseError(error, fallbackMessage = "Question Bank request failed.") {
  if (!error) return;
  throw createSupabaseRequestError(error, fallbackMessage);
}
