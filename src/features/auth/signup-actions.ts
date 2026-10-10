"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireServerEnv } from "@/lib/env";
import { safeAuthNext } from "./continuation";
import { validateEmail, validateName, validatePassword } from "./validation";

export type SignupState = { error?: string; success?: string };

function emailError(error: { status?: number; code?: string }) {
  return error.status === 429 || error.code === "over_email_send_rate_limit"
    ? "메일 발송 요청이 많습니다. 잠시 후 다시 시도해 주세요."
    : "인증 메일을 보내지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function signupAction(
  _state: SignupState,
  form: FormData,
): Promise<SignupState> {
  const email = validateEmail(form.get("email"));
  const name = validateName(form.get("name"));
  const password = validatePassword(form.get("password"));
  const next = safeAuthNext(form.get("next"), "/welcome");
  if (!email || !name || !password)
    return {
      error: "이름, 올바른 이메일과 8자 이상의 비밀번호를 입력해 주세요.",
    };
  if (password !== form.get("passwordConfirm"))
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
        emailRedirectTo: `${requireServerEnv().siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return { error: emailError(error) };
    // Fail closed if the project accidentally has email confirmation disabled.
    if (data.session) {
      await supabase.auth.signOut();
      return {
        error: "이메일 인증을 시작하지 못했습니다. 관리자에게 문의해 주세요.",
      };
    }
  } catch {
    return {
      error: "가입 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  redirect(`/signup/verify?${new URLSearchParams({ email, next })}`);
}

export async function verifySignupAction(
  _state: SignupState,
  form: FormData,
): Promise<SignupState> {
  const email = validateEmail(form.get("email"));
  const token = String(form.get("code") ?? "").trim();
  const next = safeAuthNext(form.get("next"), "/welcome");
  if (!email || !/^\d{6}$/.test(token))
    return { error: "이메일과 6자리 인증코드를 확인해 주세요." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error || !data.user?.email_confirmed_at)
      return {
        error:
          "인증코드가 올바르지 않거나 만료되었습니다. 다시 입력하거나 새 코드를 요청해 주세요.",
      };
    const { error: profileError } = await supabase.rpc("ensure_my_profile");
    if (profileError)
      return {
        error:
          "이메일은 인증됐지만 가입 설정을 완료하지 못했습니다. 로그인 후 다시 시도해 주세요.",
      };
  } catch {
    return {
      error: "인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  redirect(next);
}

export async function resendSignupAction(
  _state: SignupState,
  form: FormData,
): Promise<SignupState> {
  const email = validateEmail(form.get("email"));
  const next = safeAuthNext(form.get("next"), "/welcome");
  if (!email) return { error: "올바른 이메일을 입력해 주세요." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${requireServerEnv().siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) return { error: emailError(error) };
    return {
      success:
        "가입 인증이 필요한 계정이라면 새 인증코드가 발송됩니다. 메일함을 확인해 주세요.",
    };
  } catch {
    return {
      error: "메일 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
