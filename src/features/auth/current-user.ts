import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: "admin" | "coach";
};

export async function requireAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.email_confirmed_at) {
    redirect("/signup/verify");
  }

  if (user.user_metadata?.must_change_password === true) {
    redirect("/set-password");
  }

  let { data: profile } = await supabase
    .from("profiles")
    .select("id, organization_id, name, role, status")
    .eq("id", user.id)
    .single();

  if (!profile) {
    const { data, error } = await supabase.rpc("ensure_my_profile");
    if (error || !data) redirect("/access-denied");
    profile = data;
  }

  return { supabase, user, profile: profile! };
}

export async function requireCurrentProfile() {
  const { supabase, user, profile } = await requireAccount();

  const { data: memberships, error: membershipError } = await supabase
    .from("workspace_memberships")
    .select("organization_id,role,status,organizations!inner(id,name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  const workspaces: WorkspaceSummary[] = (memberships ?? []).map(
    (membership) => {
      const organization = membership.organizations as unknown as {
        id: string;
        name: string;
      };
      return {
        id: organization.id,
        name: organization.name,
        role: membership.role as WorkspaceSummary["role"],
      };
    },
  );
  const workspace = workspaces.find(
    (item) => item.id === profile.organization_id,
  );

  if (membershipError) redirect("/access-denied");
  if (profile.status !== "active" || !workspace) redirect("/welcome");

  return {
    supabase,
    user,
    profile: {
      ...profile,
      role: workspace.role,
      status: "active" as const,
    },
    workspace,
    workspaces,
  };
}
