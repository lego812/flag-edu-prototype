"use server";
import { redirect } from "next/navigation";
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
    return { error: "참여자와 참여 해제 확인을 다시 확인해 주세요." };
  const { supabase, profile, workspaces } = await requireCurrentProfile();
  const self = profile.id === userId;
  const membership = workspaces.find((w) => w.id === workspaceId);
  if (!membership || (!self && membership.role !== "admin"))
    return {
      error:
        "본인의 참여 해제 또는 관리자의 다른 참여자 내보내기만 가능합니다.",
    };
  const { error } = await supabase.rpc("remove_workspace_participant", {
    p_workspace_id: workspaceId,
    p_user_id: userId,
  });
  if (error)
    return {
      error:
        error.code === "23514"
          ? "마지막 관리자는 나갈 수 없습니다. 다른 참여자에게 관리자 권한을 부여한 후 다시 시도해 주세요."
          : self
            ? "나가지 못했습니다. 참여 상태를 확인하고 다시 시도해 주세요."
            : "내보내지 못했습니다. 관리자 권한과 참여자 상태를 확인해 주세요.",
    };

  revalidatePath("/", "layout");
  if (self)
    redirect(
      workspaces.some((w) => w.id !== workspaceId) ? "/workspaces" : "/welcome",
    );
  return { success: "워크스페이스에서 내보냈습니다." };
}
