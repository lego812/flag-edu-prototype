import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";

export const metadata = { title: "홈" };

export default async function DashboardPage() {
  const { profile } = await requireCurrentProfile();
  const isAdmin = profile.role === "admin";

  return (
    <div className="min-h-svh">
      <AppHeader name={profile.name} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <p className="text-sm font-semibold text-blue-600">
          {isAdmin ? "관리자" : "코치"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">
          {profile.name}님, 안녕하세요
        </h1>
        <p className="mt-3 text-slate-600">
          수업 일정을 확인하고 새로운 수업을 등록하세요.
        </p>

        <Link href="/classes" className="mt-8 mr-3 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">수업 일정 보기</Link>
        {isAdmin && (
          <Link
            href="/members"
            className="mt-8 inline-flex rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white"
          >
            구성원 관리
          </Link>
        )}
      </main>
    </div>
  );
}
