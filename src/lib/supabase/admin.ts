import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { requireServerEnv } from "@/lib/env";

export function createAdminClient(timeoutMs?: number) {
  const env = requireServerEnv();

  return createSupabaseClient(env.supabaseUrl, env.supabaseSecretKey, {
    global: timeoutMs
      ? {
          fetch: (input, init) =>
            fetch(input, {
              ...init,
              signal: init?.signal
                ? AbortSignal.any([init.signal, AbortSignal.timeout(timeoutMs)])
                : AbortSignal.timeout(timeoutMs),
            }),
        }
      : undefined,
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
