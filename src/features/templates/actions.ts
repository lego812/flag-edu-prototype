"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateFields } from "@/features/reports/validation";
import type { ActionState } from "@/features/reports/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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
  const { error } = await supabase.rpc("save_template", {
    p_id: form.get("id") || null,
    p_version: form.get("version") || null,
    p_fields: fields,
    p_publish: form.get("intent") === "publish",
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "다른 사용자가 변경했습니다. 새로고침해 주세요."
          : "저장하지 못했습니다. 항목과 DB 마이그레이션 적용 여부를 확인해 주세요.",
    };
  revalidatePath("/templates");
  redirect("/templates");
}
