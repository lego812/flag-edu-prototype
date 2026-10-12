"use server";
import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateEmail } from "@/features/auth/validation";
import { isUuid } from "@/features/classes/model";
export type InviteActionState = { error?: string; success?: string };
export async function inviteCoachAction(
  _state: InviteActionState,
  form: FormData,
): Promise<InviteActionState> {
  const email = validateEmail(form.get("email"));
  if (!email) return { error: "올바른 이메일 주소를 입력해 주세요." };
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 구성원을 초대할 수 있습니다." };
  const { error } = await supabase.rpc("create_workspace_invitation", {
    p_email: email,
  });
  if (error)
    return {
      error:
        error.code === "PT409"
          ? "이미 참여한 구성원입니다."
          : "초대를 만들지 못했습니다. 다시 시도해 주세요.",
    };
  revalidatePath("/members");
  revalidatePath("/welcome");
  return {
    success:
      "앱에 초대를 등록했습니다. 상대방이 해당 이메일로 로그인하면 받은 초대에서 확인할 수 있습니다.",
  };
}
export async function cancelInvitationAction(
  _state: InviteActionState,
  form: FormData,
): Promise<InviteActionState> {
  const id = String(form.get("invitationId") ?? "");
  if (!isUuid(id)) return { error: "올바르지 않은 초대입니다." };
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 초대를 취소할 수 있습니다." };
  const { error } = await supabase.rpc("cancel_workspace_invitation", {
    p_invitation_id: id,
  });
  if (error) return { error: "초대를 취소하지 못했습니다." };
  revalidatePath("/members");
  revalidatePath("/welcome");
  return { success: "초대를 취소했습니다." };
}
