"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAccount } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
export async function respondInvitationAction(
  _state: { error?: string },
  form: FormData,
): Promise<{ error?: string }> {
  const id = String(form.get("invitationId") ?? "");
  const decision = form.get("decision");
  if (!isUuid(id) || !["accept", "decline"].includes(String(decision)))
    return { error: "올바르지 않은 초대 응답입니다." };
  const { supabase } = await requireAccount();
  const { error } = await supabase.rpc("respond_workspace_invitation", {
    p_invitation_id: id,
    p_accept: decision === "accept",
  });
  if (error)
    return {
      error:
        "초대가 만료되었거나 사용할 수 없습니다. 초대 목록을 다시 확인해 주세요.",
    };
  revalidatePath("/", "layout");
  if (decision === "accept") redirect("/dashboard");
  return {};
}
