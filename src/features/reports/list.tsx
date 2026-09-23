import Link from "next/link";
import { ListFilters } from "@/components/list-filters";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { listReports, reportFilters } from "./repository";
import { ReportMetadata } from "./metadata";
import { ClassSearchPicker } from "@/features/classes/search-picker";
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
  const { data: selectedSession } = filters.session
    ? await supabase
        .from("class_sessions")
        .select("id,title,start_at,has_time")
        .eq("organization_id", profile.organization_id)
        .eq("id", filters.session)
        .maybeSingle()
    : { data: null };
  const base = admin ? "/admin-reports" : "/reports";
  const link = (page: number) =>
    base + "?" + new URLSearchParams({ ...filters, page: String(page) });
  return (
    <>
      <h1 className="text-2xl font-bold">
        {admin ? "전체 보고서" : "내 보고서"}
      </h1>
      <ListFilters
        from={filters.from}
        to={filters.to}
        selectedLabel={selectedSession?.title}
      >
        <form action={base} className="grid grid-cols-1 gap-4">
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
          <ClassSearchPicker key={filters.session} selected={selectedSession} />
          <button className="btn self-end">조회</button>
        </form>
      </ListFilters>
      <p className="text-sm text-neutral-600">총 {count ?? 0}개</p>
      <ul className="grid grid-cols-1 gap-3">
        {data?.map((r) => (
          <li key={r.id}>
            <Link
              href={"/reports/" + r.id}
              className="block space-y-2 rounded-3xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-black"
            >
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{r.class_sessions.title}</strong>
              </div>
              <ReportMetadata name={r.profiles.name} createdAt={r.created_at} />
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
