import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { formatClassDate, seoulToday } from "@/features/classes/dates";

export const metadata = { title: "홈" };

export default async function DashboardPage() {
  const { profile, supabase } = await requireCurrentProfile();
  const isAdmin = profile.role === "admin";
  const [sessions, drafts, recent] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id,title,start_at")
      .eq("organization_id", profile.organization_id)
      .eq("status", "scheduled")
      .gte("start_at", seoulToday() + "T00:00:00+09:00")
      .order("start_at")
      .limit(5),
    supabase
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("author_id", profile.id)
      .eq("status", "draft"),
    supabase
      .from("reports")
      .select("id,status,updated_at,class_sessions(title)")
      .eq("author_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  return (
    <div className="min-h-svh">
      <AppHeader name={profile.name} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl px-5 py-8">
        <p className="text-sm font-semibold text-black">
          {isAdmin ? "관리자" : "코치"}
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-neutral-950">
          {profile.name}님, 안녕하세요
        </h1>
        <p className="mt-3 text-neutral-600">
          수업 일정을 확인하고 새로운 수업을 등록하세요.
        </p>

        <Link
          href="/classes"
          className="mt-8 mr-3 inline-flex rounded-lg bg-black px-5 py-3 font-semibold text-white"
        >
          수업 일정 보기
        </Link>
        {isAdmin && (
          <Link
            href="/members"
            className="mt-8 inline-flex rounded-lg border border-neutral-300 px-5 py-3 font-semibold text-black"
          >
            구성원 관리
          </Link>
        )}
        {(sessions.error || drafts.error || recent.error) && (
          <p role="alert" className="mt-6 text-red-700">
            일부 현황을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        )}
        <section className="mt-10 space-y-3 border-t border-neutral-200 pt-6">
          <h2 className="text-lg font-bold">가까운 수업</h2>
          {sessions.data?.map((s) => (
            <Link
              key={s.id}
              href={"/classes/" + s.id}
              className="block border-b border-neutral-100 py-3"
            >
              <strong>{s.title}</strong>
              <span className="mt-1 block text-sm text-neutral-600">
                {formatClassDate(s.start_at)}
              </span>
            </Link>
          ))}
          {!sessions.error && !sessions.data?.length && (
            <p className="text-sm text-neutral-600">예정된 수업이 없습니다.</p>
          )}
        </section>
        <section className="mt-8 space-y-3">
          <h2 className="text-lg font-bold">내 보고서</h2>
          <Link
            className="inline-block rounded bg-accent px-3 py-2 text-sm"
            href="/reports?status=draft"
          >
            미제출 {drafts.count ?? 0}개
          </Link>
          <Link className="ml-4 text-sm underline" href="/reports">
            최근 작성 보고서 보기
          </Link>
          <ul>
            {recent.data?.map((r) => (
              <li key={r.id}>
                <Link
                  className="block py-3 text-sm underline"
                  href={"/reports/" + r.id}
                >
                  {formatClassDate(r.updated_at)} ·{" "}
                  {r.status === "draft" ? "작성 중" : "제출"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
