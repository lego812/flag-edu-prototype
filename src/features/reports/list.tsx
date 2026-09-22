import Link from "next/link";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { listReports, reportFilters } from "./repository";
import { reportStatus } from "./model";
import { formatClassDate } from "@/features/classes/dates";
export async function ReportList({
  params,
  admin = false,
}: {
  params: Record<string, string | string[] | undefined>;
  admin?: boolean;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  if (admin && profile.role !== "admin") redirect("/reports");
  let filters;
  try {
    filters = reportFilters(params);
  } catch {
    return (
      <p role="alert">
        조회 조건이 잘못되었습니다.{" "}
        <Link
          href={admin ? "/admin-reports" : "/reports"}
          className="underline"
        >
          조건 초기화
        </Link>
      </p>
    );
  }
  const { data, error, count } = await listReports(
    supabase,
    profile.organization_id,
    filters,
    admin ? undefined : profile.id,
  );
  if (error) throw new Error("보고서 조회 실패");
  const { data: members } = admin
    ? await supabase
        .from("profiles")
        .select("id,name")
        .eq("organization_id", profile.organization_id)
        .order("name")
    : { data: [] };
  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("id,title,start_at,has_time")
    .eq("organization_id", profile.organization_id)
    .order("start_at", { ascending: false })
    .limit(200);
  const base = admin ? "/admin-reports" : "/reports";
  const link = (page: number) =>
    base + "?" + new URLSearchParams({ ...filters, page: String(page) });
  return (
    <>
      <h1 className="text-2xl font-bold">
        {admin ? "전체 보고서" : "내 보고서"}
      </h1>
      <form
        action={base}
        className="grid gap-3 border-y border-neutral-200 py-5 sm:grid-cols-3"
      >
        <label className="text-sm">
          수업 시작일
          <input
            className="input mt-1"
            type="date"
            name="from"
            defaultValue={filters.from}
          />
        </label>
        <label className="text-sm">
          수업 종료일
          <input
            className="input mt-1"
            type="date"
            name="to"
            defaultValue={filters.to}
          />
        </label>
        <label className="text-sm">
          상태
          <select
            className="input mt-1"
            name="status"
            defaultValue={filters.status}
          >
            <option value="all">전체</option>
            <option value="draft">미제출</option>
            <option value="submitted">제출 · 미확인</option>
            <option value="confirmed">확인 완료</option>
          </select>
        </label>
        {admin && (
          <label className="text-sm">
            작성자
            <select
              className="input mt-1"
              name="author"
              defaultValue={filters.author}
            >
              <option value="">전체</option>
              {members?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-sm">
          수업 (최근 200개)
          <select
            className="input mt-1"
            name="session"
            defaultValue={filters.session}
          >
            <option value="">전체</option>
            {sessions?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {formatClassDate(s.start_at, s.has_time)}
              </option>
            ))}
          </select>
        </label>
        <button className="btn self-end">조회</button>
      </form>
      <p className="text-sm text-neutral-600">
        총 {count ?? 0}개 · 미제출은 생성된 임시저장 보고서입니다. 참여자 미지정
        수업의 미작성자는 집계하지 않습니다.
      </p>
      <ul className="divide-y divide-neutral-200">
        {data?.map((r) => (
          <li key={r.id}>
            <Link
              href={"/reports/" + r.id}
              className="block space-y-2 py-4 hover:bg-neutral-50"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{r.class_sessions.title}</strong>
                <span className="text-sm">{reportStatus(r)}</span>
              </div>
              <p className="text-sm text-neutral-600">
                {r.profiles.name} ·{" "}
                {formatClassDate(
                  r.class_sessions.start_at,
                  r.class_sessions.has_time,
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
      {!data?.length && <p>조회 조건에 맞는 보고서가 없습니다.</p>}
      <nav
        aria-label="보고서 페이지"
        className="flex items-center justify-between"
      >
        {filters.page > 1 ? (
          <Link className="btn-secondary" href={link(filters.page - 1)}>
            이전
          </Link>
        ) : (
          <span />
        )}
        <span>{filters.page} 페이지</span>
        {filters.page * 20 < (count ?? 0) ? (
          <Link className="btn-secondary" href={link(filters.page + 1)}>
            다음
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
