"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
export async function deleteWorkspaceAction(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const workspaceId = form.get("workspaceId"),
    confirmationName = form.get("confirmationName");
  if (
    typeof workspaceId !== "string" ||
    !isUuid(workspaceId) ||
    typeof confirmationName !== "string" ||
    !confirmationName
  )
    return { error: "워크스페이스 이름을 정확히 입력해 주세요." };
  const { supabase, workspaces } = await requireCurrentProfile();
  const target = workspaces.find(
    (w) => w.id === workspaceId && w.role === "admin",
  );
  if (!target)
    return { error: "해당 워크스페이스 관리자만 삭제할 수 있습니다." };
  if (target.name !== confirmationName)
    return {
      error:
        "현재 워크스페이스 이름과 일치하지 않습니다. 이름을 확인해 주세요.",
    };
  const { error } = await supabase.rpc("delete_workspace", {
    p_workspace_id: workspaceId,
    p_confirmation_name: confirmationName,
  });
  if (error)
    return {
      error:
        error.code === "PT409"
          ? "워크스페이스 이름이 변경됐습니다. 새로고침 후 현재 이름을 입력해 주세요."
          : "워크스페이스를 삭제하지 못했습니다. 권한을 확인하고 다시 시도해 주세요.",
    };
  revalidatePath("/", "layout");
  redirect(
    workspaces.some((w) => w.id !== workspaceId) ? "/workspaces" : "/welcome",
  );
}
