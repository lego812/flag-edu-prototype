"use server";
import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
export async function removeParticipantAction(
  _state: { error?: string; success?: string },
  form: FormData,
): Promise<{ error?: string; success?: string }> {
  const workspaceId = String(form.get("workspaceId") ?? ""),
    userId = String(form.get("userId") ?? "");
  if (!isUuid(workspaceId) || !isUuid(userId) || form.get("confirm") !== "yes")
    return { error: "참여자와 내보내기 확인을 다시 확인해 주세요." };
  const { supabase, profile, workspaces } = await requireCurrentProfile();
  if (
    !workspaces.some((w) => w.id === workspaceId && w.role === "admin") ||
    profile.id === userId
  )
    return {
      error: "해당 워크스페이스 관리자만 다른 참여자를 내보낼 수 있습니다.",
    };
  const { error } = await supabase.rpc("remove_workspace_participant", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
  if (error)
    return {
      error:
        "내보내지 못했습니다. 관리자 권한과 참여자 상태를 다시 확인해 주세요. 마지막 관리자는 유지해야 합니다.",
    };
  revalidatePath("/", "layout");
  return { success: "워크스페이스에서 내보냈습니다." };
}
