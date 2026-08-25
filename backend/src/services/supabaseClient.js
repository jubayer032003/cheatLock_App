import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

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
  const isMissingSchemaObject = error.code === "PGRST205" || /Could not find the table/i.test(error.message || "");
  const requestError = new Error(
    isMissingSchemaObject
      ? "Question Bank Supabase migration has not been applied. Apply backend/supabase/migrations/202608230001_question_bank_self_exam.sql to the configured Supabase project."
      : error.message || fallbackMessage
  );
  requestError.status = isMissingSchemaObject ? 503 : Number(error.status) || 500;
  requestError.code = error.code || "SUPABASE_REQUEST_FAILED";
  throw requestError;
}
