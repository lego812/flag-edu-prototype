import { logoutAction } from "@/features/auth/actions";

export const metadata = { title: "접근할 수 없음" };

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center px-5 py-10">
      <section className="w-full max-w-md py-7 sm:p-9">
        <p className="text-sm font-semibold text-red-600">접근 제한</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">
          사용할 수 없는 계정입니다
        </h1>
        <p className="mt-3 leading-7 text-neutral-600">
          구성원 프로필이 없거나 비활성화되었습니다. 관리자에게 문의해 주세요.
        </p>
        <form action={logoutAction} className="mt-8">
          <button className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white">
            로그아웃
          </button>
        </form>
      </section>
    </main>
  );
}
