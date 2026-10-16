import Link from "@/components/feedback-link";
import { requireMaster } from "@/features/master/access";
export default async function MasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireMaster();
  return (
    <main className="mx-auto min-h-svh w-full max-w-5xl space-y-8 px-5 py-8">
      <header className="space-y-4">
        <Link href="/manage/account" className="text-sm underline">
          계정 관리로
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-neutral-900 px-3 py-1 text-xs font-bold text-white">
            master
          </span>
          <span className="text-sm text-neutral-600">
            서비스 전체 조회 · 읽기 전용
          </span>
        </div>
        <nav
          aria-label="master 관리"
          className="flex flex-wrap gap-5 text-sm font-bold"
        >
          <Link href="/manage/users" className="min-h-11 py-3 underline">
            사용자 관리
          </Link>
          <Link
            href="/manage/all-workspaces"
            className="min-h-11 py-3 underline"
          >
            전체 워크스페이스
          </Link>
        </nav>
      </header>
      {children}
    </main>
  );
}
