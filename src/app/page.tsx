import { getPublicEnvStatus } from "@/lib/env";
import Link from "next/link";

export default function Home() {
  const envStatus = getPublicEnvStatus();

  return (
    <main className="flex min-h-svh flex-1 items-center justify-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-md py-7 sm:p-9">
        <div className="mb-8 flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-lg bg-black text-lg font-bold text-white">
            F
          </span>
          <div>
            <p className="text-sm font-medium text-black">코치 수업 보고</p>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-950">
              Flag Edu
            </h1>
          </div>
        </div>

        <h2 className="text-3xl font-bold leading-tight tracking-tight text-neutral-950">
          수업 기록을 더 간편하게
        </h2>
        <p className="mt-4 leading-7 text-neutral-600">
          수업 일정, 코치 보고서, 관리자 확인과 내보내기를 한곳에서
          관리합니다.
        </p>

        {!envStatus.configured && (
          <div className="mt-8 rounded-lg border border-accent bg-accent p-4 text-sm text-black" role="alert">
            <p className="font-semibold">개발 환경 설정이 필요합니다</p>
            <p className="mt-1 leading-6">
              누락된 환경변수: {envStatus.missing.join(", ")}
            </p>
          </div>
        )}

        {envStatus.configured && (
          <Link
            href="/login"
            className="mt-6 flex w-full justify-center rounded-lg bg-black px-4 py-3 font-semibold text-white"
          >
            기존 사용자 로그인
          </Link>
        )}

        <p className="mt-6 text-xs leading-5 text-neutral-500">
          처음 초대받은 사용자는 이메일의 초대 수락 버튼으로 시작하세요.
        </p>
      </section>
    </main>
  );
}
