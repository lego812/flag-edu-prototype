"use server";
import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
export async function renameWorkspaceAction(
  _state: { error?: string; success?: string },
  form: FormData,
): Promise<{ error?: string; success?: string }> {
  const id = String(form.get("workspaceId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const expectedName = String(form.get("expectedName") ?? "");
  if (
    !isUuid(id) ||
    Array.from(name).length < 2 ||
    Array.from(name).length > 100 ||
    !expectedName
  )
    return { error: "워크스페이스 이름을 2~100자로 입력해 주세요." };
  const { supabase, workspaces } = await requireCurrentProfile();
  if (!workspaces.some((w) => w.id === id && w.role === "admin"))
    return { error: "해당 워크스페이스 관리자만 이름을 변경할 수 있습니다." };
  const { error } = await supabase.rpc("rename_workspace", {
    p_workspace_id: id,
    p_name: name,
    p_expected_name: expectedName,
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "다른 관리자가 이름을 변경했습니다. 새로고침 후 다시 시도해 주세요."
          : "이름을 변경하지 못했습니다. 다시 시도해 주세요.",
    };
  revalidatePath("/", "layout");
  return { success: "워크스페이스 이름을 변경했습니다." };
}
