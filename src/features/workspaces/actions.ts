"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";

export type WorkspaceActionState = {
  error?: string;
};

export async function switchWorkspaceAction(formData: FormData) {
  const organizationId = String(formData.get("workspaceId") ?? "");
  const { supabase, workspace, workspaces } = await requireCurrentProfile();

  if (
    !isUuid(organizationId) ||
    !workspaces.some((item) => item.id === organizationId)
  ) {
    redirect("/access-denied");
  }
  if (organizationId !== workspace.id) {
    const { error } = await supabase.rpc("switch_workspace", {
      p_organization_id: organizationId,
    });
    if (error) redirect("/access-denied");
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function createWorkspaceAction(
  _state: WorkspaceActionState,
  formData: FormData,
): Promise<WorkspaceActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const { supabase, profile } = await requireCurrentProfile();

  if (profile.role !== "admin") {
    return { error: "관리자만 워크스페이스를 만들 수 있습니다." };
  }
  if (name.length < 2 || name.length > 100) {
    return { error: "워크스페이스 이름을 2~100자로 입력해 주세요." };
  }

  const { error } = await supabase.rpc("create_workspace", { p_name: name });
  if (error) {
    return { error: "워크스페이스를 만들지 못했습니다. 다시 시도해 주세요." };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
