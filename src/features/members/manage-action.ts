"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import type { ActionState } from "@/features/reports/model";
import { isUuid } from "@/features/classes/model";
import { revalidatePath } from "next/cache";
export async function manageMemberAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  const id = String(form.get("id")),
    role = String(form.get("role")),
    status = String(form.get("status"));
  if (
    profile.role !== "admin" ||
    !isUuid(id) ||
    !["admin", "coach"].includes(role) ||
    !["active", "inactive"].includes(status) ||
    form.get("confirm") !== "yes"
  )
    return { error: "변경 내용과 관리자 권한을 확인해 주세요." };
  if (id === profile.id && status === "inactive")
    return { error: "본인 계정의 비활성화는 다른 관리자가 처리해야 합니다." };
  const { error } = await supabase.rpc("manage_member", {
    p_user_id: id,
    p_role: role,
    p_status: status,
  });
  if (error)
    return {
      error: "변경하지 못했습니다. 마지막 활성 관리자는 유지되어야 합니다.",
    };
  revalidatePath("/members");
  return { success: "변경했습니다." };
}
