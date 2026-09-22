import { createBrowserClient } from "@supabase/ssr";
import { requirePublicEnv } from "@/lib/env";

export function createClient() {
  const env = requirePublicEnv();

  return createBrowserClient(env.supabaseUrl, env.supabasePublishableKey);
}
