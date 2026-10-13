import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import Link from "@/components/feedback-link";

import { GoogleLogin } from "@/features/auth/google-login";

export const metadata = { title: "로그인" };

export default async function LoginPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold text-black">Flag Edu</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">
          로그인
        </h1>
        <GoogleLogin />
        <p className="mt-3 text-sm text-neutral-600">
          <Link href="/terms" className="underline">
            이용약관
          </Link>
          {" · "}
          <Link href="/privacy" className="underline">
            개인정보처리방침
          </Link>
        </p>
        <p className="mb-4 mt-7 text-sm text-neutral-600">
          기존 이메일 계정으로 로그인
        </p>
        <LoginForm />
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-sm text-neutral-600 underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
        <p className="mt-4 text-sm leading-6 text-neutral-600">
          새 회원가입은 Google 계정으로 진행합니다. 워크스페이스 초대는 로그인
          후 앱에서 확인하세요.
        </p>
      </section>
    </main>
  );
}
