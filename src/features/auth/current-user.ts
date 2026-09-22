import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (user.user_metadata?.must_change_password === true) {
    redirect("/set-password");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, name, role, status")
    .eq("id", user.id)
    .single();

  if (!profile || profile.status !== "active") {
    redirect("/access-denied");
  }

  return { supabase, user, profile };
}
