import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function LegacyTemplatePage() {
  const { profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  redirect(`/workspaces/${profile.organization_id}/templates`);
}
