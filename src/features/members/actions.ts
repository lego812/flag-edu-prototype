"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireServerEnv } from "@/lib/env";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { validateEmail, validateName } from "@/features/auth/validation";

export type InviteActionState = {
  error?: string;
  success?: string;
};

export type ResendInviteActionState = {
  error?: string;
  success?: string;
};

type AdminClient = ReturnType<typeof createAdminClient>;

function getEmailDeliveryErrorMessage(error: {
  code?: string;
  status?: number;
  message: string;
}) {
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return "Supabase 메일 발송 한도를 초과했습니다. 잠시 후 다시 시도하거나 SMTP 설정을 확인해 주세요.";
  }

  if (error.message.toLowerCase().includes("redirect")) {
    return "인증 Redirect URL 설정을 확인해 주세요.";
  }

  return "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

async function sendInvitation(
  adminClient: AdminClient,
  email: string,
  name: string,
  redirectTo: string,
) {
  return adminClient.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { name, must_change_password: true },
  });
}

export async function inviteCoachAction(
  _state: InviteActionState,
  formData: FormData,
): Promise<InviteActionState> {
  const email = validateEmail(formData.get("email"));
  const name = validateName(formData.get("name"));

  if (!email || !name) {
    return { error: "이름과 올바른 이메일 주소를 입력해 주세요." };
  }

  const { supabase, profile } = await requireCurrentProfile();

  if (profile.role !== "admin") {
    return { error: "관리자만 구성원을 초대할 수 있습니다." };
  }

  try {
    const { data: existingUserId, error: existingUserError } =
      await supabase.rpc("find_workspace_user_by_email", { p_email: email });

    if (existingUserError) {
      return { error: "기존 계정을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." };
    }

    if (existingUserId) {
      const { error: membershipError } = await supabase.rpc(
        "add_existing_workspace_member",
        { p_user_id: existingUserId },
      );

      if (membershipError) {
        return {
          error:
            membershipError.code === "PT409"
              ? "이미 현재 워크스페이스에 참여한 사용자입니다."
              : "기존 계정을 현재 워크스페이스에 추가하지 못했습니다.",
        };
      }

      revalidatePath("/members");
      return {
        success: `${email} 계정을 현재 워크스페이스에 추가했습니다.`,
      };
    }

    const env = requireServerEnv();
    const adminClient = createAdminClient();
    const redirectTo = `${env.siteUrl}/auth/callback?next=/set-password`;
    const { data, error: inviteError } = await sendInvitation(
      adminClient, email, name, redirectTo,
    );

    if (inviteError || !data.user) {
      return {
        error: inviteError
          ? inviteError.message.includes("already")
            ? "이미 가입되었거나 초대된 이메일입니다."
            : getEmailDeliveryErrorMessage(inviteError)
          : "초대 사용자를 만들지 못했습니다.",
      };
    }

    const { error: profileError } = await supabase.rpc(
      "register_workspace_invitee",
      { p_user_id: data.user.id, p_name: name },
    );

    if (profileError) {
      return { error: "초대는 생성됐지만 구성원 등록에 실패했습니다. 관리자에게 문의해 주세요." };
    }

    revalidatePath("/members");
    return {
      success: `${email} 주소로 초대 메일을 보냈습니다.`,
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "초대 기능의 서버 설정을 확인해 주세요.",
    };
  }
}

export async function resendCoachInvitationAction(
  _state: ResendInviteActionState,
  formData: FormData,
): Promise<ResendInviteActionState> {
  const userId = formData.get("userId");

  if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
    return { error: "잘못된 구성원 정보입니다." };
  }

  const { profile: currentProfile } = await requireCurrentProfile();

  if (currentProfile.role !== "admin") {
    return { error: "관리자만 초대 메일을 재발송할 수 있습니다." };
  }

  try {
    const env = requireServerEnv();
    const adminClient = createAdminClient();
    const { data: invitedProfile, error: profileError } = await adminClient
      .from("workspace_memberships")
      .select("status, profiles!inner(name)")
      .eq("user_id", userId)
      .eq("organization_id", currentProfile.organization_id)
      .single();

    if (profileError || !invitedProfile || invitedProfile.status !== "pending") {
      return { error: "같은 기관의 초대 구성원을 찾을 수 없습니다." };
    }

    const { data: authData, error: authError } =
      await adminClient.auth.admin.getUserById(userId);

    if (authError || !authData.user.email) {
      return { error: "초대 사용자를 찾을 수 없습니다." };
    }

    const email = authData.user.email.toLowerCase();
    const redirectTo = `${env.siteUrl}/auth/callback?next=/set-password`;

    if (authData.user.email_confirmed_at) {
      const { error: recoveryError } =
        await adminClient.auth.resetPasswordForEmail(email, { redirectTo });

      if (recoveryError) {
        return { error: getEmailDeliveryErrorMessage(recoveryError) };
      }

      revalidatePath("/members");
      return { success: "새 비밀번호 설정 메일을 보냈습니다." };
    }

    const { error: invitationError } = await sendInvitation(
      adminClient,
      email,
      (invitedProfile.profiles as unknown as { name: string }).name,
      redirectTo,
    );
    if (invitationError) {
      return { error: getEmailDeliveryErrorMessage(invitationError) };
    }

    revalidatePath("/members");
    return { success: "새 초대 메일을 보냈습니다." };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "초대 메일 재발송 중 오류가 발생했습니다.",
    };
  }
}
