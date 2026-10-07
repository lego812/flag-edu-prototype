import type { SupabaseClient } from "@supabase/supabase-js";

export async function listWorkspaceAuthors(
  client: SupabaseClient,
  organizationId: string,
) {
  const { data, error } = await client
    .from("workspace_memberships")
    .select("user_id,profiles!inner(name)")
    .eq("organization_id", organizationId);

  return {
    error,
    data: (data ?? [])
      .map((member) => ({
        id: member.user_id as string,
        name: (member.profiles as unknown as { name: string }).name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
  };
}
