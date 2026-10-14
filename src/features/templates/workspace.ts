import { notFound, redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";



export async function requireTemplateWorkspace(id: string) {
  if (!isUuid(id)) notFound();
  const context = await requireCurrentProfile();
  const target = context.workspaces.find((item) => item.id === id);
  if (!target) notFound();
  if (target.role !== "admin" || context.workspace.id !== id)
    redirect(`/workspaces/${id}`);
  return context;
}
