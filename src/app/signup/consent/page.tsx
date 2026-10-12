import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignupConsentForm } from "@/features/auth/consent-form";
import { LogoutButton } from "@/features/auth/logout-button";

export const metadata = { title: "회원가입 동의" };

export default async function SignupConsentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/access-denied");
  const { data: accepted, error } = await supabase.rpc("has_signup_consent");
  if (error)
    throw new Error(
      "가입 동의 상태를 확인하지 못했습니다. 다시 시도해 주세요.",
    );
  if (accepted === true) redirect("/welcome");
  return (
    <main className="mx-auto min-h-svh max-w-md space-y-8 px-5 py-12">
      <header>
        <p className="text-sm font-semibold">Flag Edu</p>
        <h1 className="mt-3 text-2xl font-bold">회원가입을 완료해 주세요</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          서비스 이용에 필요한 내용을 확인하고 동의해 주세요.
        </p>
      </header>
      <SignupConsentForm />
      <LogoutButton />
    </main>
  );
}
