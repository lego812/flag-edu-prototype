import { redirect } from "next/navigation";
import { LoginForm } from "@/features/auth/login-form";
import { createClient } from "@/lib/supabase/server";
import Link from "@/components/feedback-link";
import { safeAuthNext } from "@/features/auth/continuation";

export const metadata = { title: "로그인" };

export default async function LoginPage(
  { searchParams }: { searchParams: Promise<{ next?: string }> } = {
    searchParams: Promise.resolve({}),
  },
) {
  const next = safeAuthNext((await searchParams).next);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next);
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold text-black">Flag Edu</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">
          로그인
        </h1>
        <LoginForm next={next} />
        <Link
          href="/forgot-password"
          className="mt-5 inline-block text-sm text-neutral-600 underline"
        >
          비밀번호를 잊으셨나요?
        </Link>
        <p className="mt-4 text-sm leading-6 text-neutral-600">
          <Link
            href={`/signup?next=${encodeURIComponent(next === "/dashboard" ? "/welcome" : next)}`}
            className="underline"
          >
            이메일로 회원가입
          </Link>
        </p>
      </section>
    </main>
  );
}
