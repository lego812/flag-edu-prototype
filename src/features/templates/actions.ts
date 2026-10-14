"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateFields } from "@/features/reports/validation";
import type { ActionState } from "@/features/reports/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { templatePath } from "./paths";
import { isUuid } from "@/features/classes/model";

export async function saveTemplateAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 템플릿을 변경할 수 있습니다." };
  const workspaceId = String(form.get("workspaceId") ?? "");
  if (!isUuid(workspaceId) || profile.organization_id !== workspaceId)
    return { error: "워크스페이스가 변경되었습니다. 해당 워크스페이스로 전환한 뒤 다시 열어 주세요." };
  let fields;
  try {
    fields = JSON.parse(String(form.get("fields")));
  } catch {
    return { error: "항목을 확인해 주세요." };
  }
  const invalid = validateFields(fields);
  if (invalid) return { error: invalid };
  if (form.get("intent") === "publish" && form.get("confirm") !== "yes")
    return { error: "게시 확인을 선택해 주세요." };
  const name = String(form.get("name") ?? "").trim();
  if (!name || name.length > 100) return {error:"양식 이름은 1~100자로 입력해 주세요."};
  const { error } = await supabase.rpc("save_workspace_template", {
    p_workspace_id: workspaceId,
    p_name: name,
    p_id: form.get("id") || null,
    p_version: form.get("version") || null,
    p_fields: fields,
    p_publish: form.get("intent") === "publish",
  });
  if (error)
    return {
      error:
        error.code === "40001" || error.code === "PT409"
          ? "다른 사용자가 변경했습니다. 새로고침해 주세요."
          : error.code === "42501"
            ? "워크스페이스 또는 권한이 변경되었습니다. 화면을 다시 열어 주세요."
            : "양식을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  revalidatePath(templatePath(workspaceId));
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/templates");
  revalidatePath("/classes", "layout");
  redirect(templatePath(workspaceId));
}

export async function deactivateTemplateAction(
  id: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin" || !isUuid(id))
    return { error: "양식을 삭제할 권한이 없습니다." };
  const workspaceId = String(form.get("workspaceId") ?? "");
  if (!isUuid(workspaceId) || profile.organization_id !== workspaceId)
    return { error: "워크스페이스가 변경되었습니다. 해당 워크스페이스로 전환한 뒤 다시 열어 주세요." };
  if (form.get("confirm") !== "yes")
    return { error: "삭제를 확인해 주세요." };
  const { error } = await supabase.rpc("deactivate_workspace_template", {
    p_workspace_id: workspaceId,
    p_template_version_id: id,
  });
  if (error) return { error: "양식을 삭제하지 못했습니다." };
  revalidatePath(templatePath(workspaceId));
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath("/templates");
  revalidatePath("/classes", "layout");
  redirect(templatePath(workspaceId));
}
