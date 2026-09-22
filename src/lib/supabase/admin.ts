import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

export function createAdminClient() {
  const env = requireServerEnv();

  return createSupabaseClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
