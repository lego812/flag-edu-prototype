import Link from "@/components/feedback-link";
import { SignupForm } from "@/features/auth/signup-form";
import { safeAuthNext } from "@/features/auth/continuation";
export const metadata = { title: "회원가입" };
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const next = safeAuthNext((await searchParams).next, "/welcome");
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold">Flag Edu</p>
        <h1 className="mt-2 text-3xl font-bold">회원가입</h1>
        <p className="mt-3 text-sm leading-6 text-neutral-600">
          이메일 인증을 마치면 워크스페이스를 만들거나 초대를 수락할 수
          있습니다.
        </p>
        <SignupForm next={next} />
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="mt-5 inline-block text-sm underline"
        >
          이미 계정이 있으신가요? 로그인
        </Link>
      </section>
    </main>
  );
}
