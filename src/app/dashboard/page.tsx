import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { formatClassDate, seoulToday } from "@/features/classes/dates";
import { ReportMetadata } from "@/features/reports/metadata";

export const metadata = { title: "홈" };

export default async function DashboardPage() {
  const { profile, supabase } = await requireCurrentProfile();
  const isAdmin = profile.role === "admin";
  const [sessions, drafts, recent] = await Promise.all([
    supabase
      .from("class_sessions")
      .select("id,title,start_at,has_time")
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
      .select("id,created_at,class_sessions(title)")
      .eq("author_id", profile.id)
      .order("updated_at", { ascending: false })
      .limit(5),
  ]);

  const nextClass = sessions.data?.[0];
  return (
    <>
      <AppHeader name={profile.name} isAdmin={isAdmin} />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-6 sm:px-8 sm:py-10">
        <header>
          <p className="eyebrow">
            {seoulToday().replaceAll("-", ". ")} · {isAdmin ? "관리자" : "코치"}
          </p>
          <h1 className="mt-3 break-words text-3xl font-bold tracking-tight sm:text-4xl">
            {profile.name}님,
            <br />
            오늘의 수업을 기록해 볼까요?
          </h1>
        </header>
        {(sessions.error || drafts.error || recent.error) && (
          <p role="alert" className="text-sm text-red-700">
            일부 현황을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        )}
        <div className="grid gap-5 md:grid-cols-[1.4fr_1fr]">
          <section className="flex min-h-72 flex-col items-start justify-between rounded-[2rem] bg-neutral-900 p-8 text-white sm:min-h-80 sm:p-10">
            <div>
              <p className="text-sm text-neutral-300">다가오는 수업</p>
              <h2 className="mt-4 break-words text-2xl font-bold sm:text-3xl">
                {nextClass?.title ??
                  (sessions.error
                    ? "일정을 확인해 주세요"
                    : "새로운 수업을 시작해 보세요.")}
              </h2>
              {nextClass && (
                <p className="mt-3 text-sm text-neutral-300">
                  {formatClassDate(nextClass.start_at, nextClass.has_time)}
                </p>
              )}
            </div>
            <Link
              className="mt-8 inline-flex min-h-12 items-center rounded-full bg-white px-7 py-3 text-sm font-bold text-black"
              href={nextClass ? "/classes/" + nextClass.id : "/classes"}
            >
              {nextClass ? "수업 확인 · 기록하기" : "수업 일정 보기"}{" "}
              <span aria-hidden="true" className="ml-4">
                ↗
              </span>
            </Link>
          </section>
          <section className="surface flex flex-col justify-between p-8">
            <div>
              <p className="eyebrow">MY NOTES</p>
              <h2 className="mt-4 text-2xl font-bold">
                마무리를 기다리는
                <br />
                나의 기록.
              </h2>
              <p className="mt-4 text-sm text-neutral-600">
                {drafts.error
                  ? "작성 중인 기록을 확인하지 못했습니다."
                  : drafts.count
                    ? "작성 중인 보고서를 이어서 완성해 주세요."
                    : "작성 중인 보고서가 없어요."}
              </p>
            </div>
            <Link
              className="btn-secondary mt-8 self-start"
              href="/reports?status=draft"
            >
              임시저장 {drafts.error ? "—" : (drafts.count ?? 0)}개
              {!drafts.error && !!drafts.count && (
                <span
                  aria-hidden="true"
                  className="ml-3 size-2 rounded-full bg-accent"
                />
              )}
            </Link>
          </section>
        </div>
        <div className="grid gap-8 md:grid-cols-2">
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">수업 일정</h2>
              <Link href="/classes" className="text-sm text-neutral-600">
                전체 보기 →
              </Link>
            </div>
            <div className="surface divide-y divide-neutral-100 px-6">
              {sessions.data?.map((s) => (
                <Link
                  key={s.id}
                  href={"/classes/" + s.id}
                  className="block py-5"
                >
                  <strong className="block break-words">{s.title}</strong>
                  <span className="mt-1 block text-sm text-neutral-500">
                    {formatClassDate(s.start_at, s.has_time)}
                  </span>
                </Link>
              ))}
              {!sessions.error && !sessions.data?.length && (
                <p className="py-8 text-sm text-neutral-500">
                  예정된 수업이 없습니다.
                </p>
              )}
            </div>
          </section>
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold">최근 기록</h2>
              <Link href="/reports" className="text-sm text-neutral-600">
                전체 보기 →
              </Link>
            </div>
            <ul className="surface divide-y divide-neutral-100 px-6">
              {recent.data?.map((r) => (
                <li key={r.id}>
                  <Link className="block py-5" href={"/reports/" + r.id}>
                    <span className="font-semibold">보고서</span>
                    <ReportMetadata
                      name={profile.name}
                      createdAt={r.created_at}
                    />
                  </Link>
                </li>
              ))}
              {!recent.error && !recent.data?.length && (
                <li className="py-8 text-sm text-neutral-500">
                  첫 수업의 기록을 남겨 보세요.
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </>
  );
}
