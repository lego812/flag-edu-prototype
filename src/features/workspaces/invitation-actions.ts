"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  invitationToken,
  passwordSetupPath,
} from "@/features/auth/continuation";

export type AcceptanceState = { error?: string; next?: string };

// Called only after email credentials have been exchanged, or by an explicit
// acceptance form. Merely fetching an invitation URL never grants membership.
export async function finishInvitationAuthentication(
  token: string,
): Promise<AcceptanceState> {
  if (!invitationToken(token))
    return { error: "올바르지 않은 초대 링크입니다." };
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email_confirmed_at)
      return { error: "초대받은 이메일로 가입·인증하거나 로그인해 주세요." };
    if (user.user_metadata?.must_change_password === true)
      return { next: passwordSetupPath(`/invitations/${token}`) };
    const { error } = await supabase.rpc("accept_workspace_invitation", {
      p_token: token,
    });
    if (error)
      return {
        error:
          error.code === "42501"
            ? "초대받은 이메일과 로그인한 계정이 다릅니다. 초대받은 이메일로 로그인해 주세요."
            : "초대가 만료되었거나 이미 사용되었습니다. 관리자에게 새 초대 메일을 요청해 주세요.",
      };
    revalidatePath("/", "layout");
    return { next: "/dashboard" };
  } catch {
    return {
      error: "초대 수락을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function acceptInvitationAction(
  _state: AcceptanceState,
  form: FormData,
): Promise<AcceptanceState> {
  const result = await finishInvitationAuthentication(
    String(form.get("token") ?? ""),
  );
  if (result.next) redirect(result.next);
  return result;
}
