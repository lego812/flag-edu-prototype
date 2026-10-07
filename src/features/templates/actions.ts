"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateFields } from "@/features/reports/validation";
import type { ActionState } from "@/features/reports/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid } from "@/features/classes/model";

export async function saveTemplateAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 템플릿을 변경할 수 있습니다." };
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
  const { error } = await supabase.rpc("save_named_template", {
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
          : "저장하지 못했습니다. 항목과 DB 마이그레이션 적용 여부를 확인해 주세요.",
    };
  revalidatePath("/templates");
  redirect("/templates");
}

export async function deactivateTemplateAction(
  id: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin" || !isUuid(id))
    return { error: "양식을 삭제할 권한이 없습니다." };
  if (form.get("confirm") !== "yes")
    return { error: "삭제를 확인해 주세요." };
  const { error } = await supabase.rpc("deactivate_template", {
    p_template_version_id: id,
  });
  if (error) return { error: "양식을 삭제하지 못했습니다." };
  revalidatePath("/templates");
  redirect("/templates");
}
