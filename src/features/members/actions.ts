"use server";

import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerEnv } from "@/lib/env";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateEmail } from "@/features/auth/validation";
import { isUuid } from "@/features/classes/model";

export type InviteActionState = { error?: string; success?: string };
export type ResendInviteActionState = InviteActionState;

async function sendWorkspaceInvitation(
  email: string,
  supabase: Awaited<ReturnType<typeof requireCurrentProfile>>["supabase"],
): Promise<InviteActionState> {
  try {
    const env = requireServerEnv();
    const token = randomBytes(32).toString("hex");
    const { error } = await supabase.rpc("create_workspace_invitation", {
      p_email: email,
      p_token_hash: createHash("sha256").update(token).digest("hex"),
    });
    if (error)
      return {
        error:
          error.code === "PT409"
            ? "이미 현재 워크스페이스에 참여한 사용자입니다."
            : "초대를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
      };
    // Use the existing Supabase Auth mail transport for both new and existing
    // accounts. This authenticates email ownership, but never adds membership.
    const { error: deliveryError } =
      await createAdminClient().auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          data: { must_change_password: true },
          emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(`/invitations/${token}`)}`,
        },
      });
    revalidatePath("/members");
    if (deliveryError)
      return {
        error:
          deliveryError.status === 429 ||
          deliveryError.code === "over_email_send_rate_limit"
            ? "메일 발송 한도를 초과했습니다. 초대는 대기 상태로 보존했습니다. 잠시 후 메일을 재발송해 주세요."
            : "초대 메일을 보내지 못했습니다. 초대는 대기 상태로 보존했습니다. 잠시 후 재발송해 주세요.",
      };
    return {
      success: `${email} 주소로 워크스페이스 초대 메일을 보냈습니다. 수락하면 접근할 수 있습니다.`,
    };
  } catch {
    return {
      error:
        "초대 메일 발송을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

export async function inviteCoachAction(
  _state: InviteActionState,
  form: FormData,
): Promise<InviteActionState> {
  const email = validateEmail(form.get("email"));
  if (!email) return { error: "올바른 이메일 주소를 입력해 주세요." };
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 구성원을 초대할 수 있습니다." };
  return sendWorkspaceInvitation(email, supabase);
}

export async function resendCoachInvitationAction(
  _state: ResendInviteActionState,
  form: FormData,
): Promise<ResendInviteActionState> {
  const id = form.get("invitationId");
  if (typeof id !== "string" || !isUuid(id))
    return { error: "잘못된 초대 정보입니다." };
  const { supabase, profile } = await requireCurrentProfile();
  if (profile.role !== "admin")
    return { error: "관리자만 초대 메일을 재발송할 수 있습니다." };
  const { data, error } = await supabase
    .from("workspace_invitations")
    .select("email")
    .eq("id", id)
    .eq("organization_id", profile.organization_id)
    .is("accepted_at", null)
    .maybeSingle();
  if (error || !data)
    return { error: "현재 워크스페이스의 대기 중인 초대를 찾을 수 없습니다." };
  return sendWorkspaceInvitation(data.email, supabase);
}
