"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const { error } = await supabase.auth.updateUser({
    password,
    data: { must_change_password: false },
  });

  if (error) {
    return { error: "비밀번호를 설정하지 못했습니다. 초대 링크를 다시 확인해 주세요." };
  }

  redirect("/dashboard");
}
