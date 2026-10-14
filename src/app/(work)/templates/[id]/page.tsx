import { redirect, notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
export default async function LegacyTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  redirect(`/workspaces/${profile.organization_id}/templates/${id}`);
}
