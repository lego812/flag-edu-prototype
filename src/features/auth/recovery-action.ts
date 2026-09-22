"use server";
import { createClient } from "@/lib/supabase/server";
import { requireServerEnv } from "@/lib/env";
import { validateEmail } from "./validation";
import type { ActionState } from "@/features/reports/model";
export async function recoveryAction(
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const email = validateEmail(form.get("email"));
  if (!email) return { error: "올바른 이메일을 입력해 주세요." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo:
        requireServerEnv().siteUrl + "/auth/callback?next=/set-password",
    });
    if (error)
      return { error: "메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요." };
  } catch {
    return { error: "메일 서비스에 연결하지 못했습니다." };
  }
  return {
    success:
      "등록된 계정이라면 비밀번호 설정 메일이 발송됩니다. 메일함을 확인해 주세요.",
  };
}
