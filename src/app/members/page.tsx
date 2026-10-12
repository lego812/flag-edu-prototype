import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
export default async function MembersPage() {
  const { profile, workspace } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  redirect(`/workspaces/${workspace.id}#participants`);
}
