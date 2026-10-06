"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateEmail, validatePassword } from "./validation";

export type AuthActionState = {
  error?: string;
};

export async function loginAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = validateEmail(formData.get("email"));
  const password = validatePassword(formData.get("password"));

  if (!email || !password) {
    return { error: "올바른 이메일과 8자 이상의 비밀번호를 입력해 주세요." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "이메일 또는 비밀번호를 확인해 주세요." };
  }

  if (data.user.user_metadata?.must_change_password === true) {
    redirect("/set-password");
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function setPasswordAction(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = validatePassword(formData.get("password"));
  const passwordConfirm = formData.get("passwordConfirm");

  if (!password) {
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  }

  if (password !== passwordConfirm) {
    return { error: "비밀번호 확인이 일치하지 않습니다." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "비밀번호 설정 링크를 다시 확인해 주세요." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password });

  if (passwordError) {
    return { error: "비밀번호를 설정하지 못했습니다. 초대 링크를 다시 확인해 주세요." };
  }

  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: "구성원 상태를 확인하지 못했습니다. 관리자에게 문의해 주세요." };
  }

  if (profile.status === "pending") {
    const { data: activated, error: activationError } = await adminClient
      .from("profiles")
      .update({ status: "active" })
      .eq("id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (activationError || !activated) {
      return { error: "가입을 완료하지 못했습니다. 관리자에게 문의해 주세요." };
    }
  }

  const { error: metadataError } = await supabase.auth.updateUser({
    data: { must_change_password: false },
  });

  if (metadataError) {
    return { error: "비밀번호 설정 상태를 저장하지 못했습니다. 다시 시도해 주세요." };
  }

  redirect("/dashboard");
}
