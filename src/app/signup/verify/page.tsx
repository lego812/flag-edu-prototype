import Link from "@/components/feedback-link";
import { VerifySignupForm } from "@/features/auth/signup-form";
import { safeAuthNext } from "@/features/auth/continuation";
import { validateEmail } from "@/features/auth/validation";
export const metadata = { title: "이메일 인증" };
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; next?: string }>;
}) {
  const params = await searchParams;
  const next = safeAuthNext(params.next, "/welcome");
  const email = validateEmail(params.email ?? null) ?? "";
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <h1 className="text-3xl font-bold">이메일 인증</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          메일로 받은 6자리 인증코드를 입력해 주세요. 메일이 보이지 않으면
          스팸함도 확인하세요.
        </p>
        <VerifySignupForm email={email} next={next} />
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-block text-sm underline"
        >
          가입 정보 다시 입력
        </Link>
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="ml-5 text-sm underline"
        >
          로그인
        </Link>
      </section>
    </main>
  );
}
