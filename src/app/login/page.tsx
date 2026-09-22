import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

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
        <p className="mt-3 leading-7 text-neutral-600">
          이미 비밀번호를 설정한 계정으로 로그인하세요.
        </p>
        <div className="mt-4 text-sm leading-6 text-neutral-600">
          처음이신가요? 초대 이메일의{" "}
          <strong className="text-black">초대 수락</strong>으로 비밀번호를
          설정하세요.
        </div>
        <LoginForm />
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-sm text-neutral-600 underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
      </section>
    </main>
  );
}
