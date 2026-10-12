"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { SIGNUP_POLICY_PUBLISHED, SIGNUP_POLICY_VERSION } from "./legal-policy";

export async function acceptSignupConsentAction(
  _state: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  if (!SIGNUP_POLICY_PUBLISHED)
    return {
      error: "가입 안내를 준비하고 있습니다. 잠시 후 다시 확인해 주세요.",
    };
  if (formData.get("terms") !== "yes" || formData.get("privacy") !== "yes") {
    return { error: "필수 동의사항을 모두 확인해 주세요." };
  }
  if (formData.get("policyVersion") !== SIGNUP_POLICY_VERSION) {
    return {
      error: "가입 안내가 변경되었습니다. 새로고침 후 다시 확인해 주세요.",
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at)
    return { error: "Google 계정 인증을 다시 진행해 주세요." };
  const { error } = await supabase.rpc("accept_signup_consents", {
    p_policy_version: SIGNUP_POLICY_VERSION,
    p_terms: true,
    p_privacy: true,
  });
  if (error)
    return {
      error:
        error.code === "PT409"
          ? "가입 안내가 변경되었습니다. 새로고침 후 다시 확인해 주세요."
          : "동의 내용을 저장하지 못했습니다. 다시 시도해 주세요.",
    };
  revalidatePath("/", "layout");
  redirect("/welcome");
}
