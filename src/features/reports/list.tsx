import { SubmitButton } from "@/components/submit-button";
import { FilterForm } from "@/components/filter-form";
import Link from "@/components/feedback-link";
import { ListFilters } from "@/components/list-filters";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { redirect } from "next/navigation";
import { listReportAuthors, listReportSummaries, reportFilters } from "./repository";
import { ReportMetadata } from "./metadata";
import { ClassSearchPicker } from "@/features/classes/search-picker";
import { listWorkspaceAuthors } from "@/features/members/repository";
export async function ReportList({
  params,
  admin = false,
}: {
  params: Record<string, string | string[] | undefined>;
  admin?: boolean;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  if (admin && profile.role !== "admin") redirect("/reports");
  const shared = admin || params.scope === "workspace";
  const base = admin ? "/admin-reports" : "/reports";
  const scope: Record<string, string> = !admin && shared ? { scope: "workspace" } : {};
  let filters;
  try {
    filters = reportFilters(params);
  } catch {
    return (
      <p role="alert">
        조회 조건이 잘못되었습니다.{" "}
        <Link
          href={shared && !admin ? "/reports?scope=workspace" : base}
          className="underline"
        >
          조건 초기화
        </Link>
      </p>
    );
  }
  const [{ data, error, count }, { data: members, error: membersError }, { data: selectedSession }] =
    await Promise.all([
      listReportSummaries(
        supabase,
        profile.organization_id,
        filters,
        shared ? undefined : profile.id,
      ),
      admin
        ? listWorkspaceAuthors(supabase, profile.organization_id)
        : shared ? listReportAuthors(supabase) : Promise.resolve({ data: [], error: null }),
      filters.session
        ? supabase
            .from("class_sessions")
            .select("id,title,start_at,has_time")
            .eq("organization_id", profile.organization_id)
            .eq("id", filters.session)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
  if (error) throw new Error("보고서 조회 실패");
  if (membersError) throw new Error("보고서 작성자 조회 실패");
  const link = (page: number) =>
    base + "?" + new URLSearchParams({ ...filters, ...scope, page: String(page) });
  return (
    <>
      <h1 className="text-2xl font-bold">
        {admin ? "전체 보고서" : shared ? "워크스페이스 보고서" : "내 보고서"}
      </h1>
      {!admin && (
        <nav aria-label="보고서 조회 범위" className="flex flex-wrap gap-2">
          <Link href="/reports" aria-current={!shared ? "page" : undefined} className={!shared ? "btn" : "btn-secondary"}>내 보고서</Link>
          <Link href="/reports?scope=workspace" aria-current={shared ? "page" : undefined} className={shared ? "btn" : "btn-secondary"}>워크스페이스 보고서</Link>
        </nav>
      )}
      {!admin && shared && <p className="text-sm text-neutral-600">같은 워크스페이스의 보고서를 조회합니다. 다른 사람이 작성한 보고서는 수정할 수 없습니다.</p>}
      <ListFilters
        from={filters.from}
        to={filters.to}
        selectedLabel={selectedSession?.title}
      >
        <FilterForm action={base} className="grid grid-cols-1 gap-4">
          {!admin && shared && <input type="hidden" name="scope" value="workspace" />}
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
          {shared && (
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
          <SubmitButton pendingLabel="조회 중…" className="btn self-end">조회</SubmitButton>
        </FilterForm>
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
              <ReportMetadata
                name={r.profiles.name}
                createdAt={r.created_at}
                classStartAt={r.class_sessions.start_at}
                classHasTime={r.class_sessions.has_time}
                location={r.class_sessions.location}
              />
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
