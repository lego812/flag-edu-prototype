import Link from "next/link";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { formatClassDate } from "@/features/classes/dates";
import { CLASS_PAGE_SIZE, classRepository } from "@/features/classes/repository";
import { parseClassFilters } from "@/features/classes/validation";

export const metadata = { title: "수업 목록" };
export default async function ClassesPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  const parsed = parseClassFilters(await searchParams);
  const filters = parsed.filters;
  const result = filters ? await classRepository(supabase, profile).list(filters) : null;
  const link = (page: number) => "/classes?" + new URLSearchParams({ from: filters!.from, to: filters!.to, status: filters!.status, page: String(page) });
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-bold text-neutral-950">수업 일정</h1><p className="mt-2 text-neutral-600">기관의 수업을 확인하고 일정을 등록하세요.</p></div>
      <Link href="/classes/new" className="rounded-lg bg-black px-5 py-3 font-semibold text-white">수업 등록</Link>
    </div>
    <form action="/classes" className="grid gap-4 border-y border-neutral-200 py-5 sm:grid-cols-4">
      <label className="min-w-0 text-sm font-medium">시작일<input aria-label="조회 시작일" type="date" name="from" required defaultValue={filters?.from} className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 p-3" /></label>
      <label className="min-w-0 text-sm font-medium">종료일<input aria-label="조회 종료일" type="date" name="to" required defaultValue={filters?.to} className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 p-3" /></label>
      <label className="text-sm font-medium">상태<select name="status" defaultValue={filters?.status ?? "all"} className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white p-3">
        <option value="all">전체</option><option value="scheduled">예정</option><option value="cancelled">취소</option>
      </select></label>
      <button className="self-end rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white">조회</button>
      <p className="text-xs text-neutral-500 sm:col-span-4">한국 시간의 수업 시작일 기준으로 조회합니다. 종료일도 포함됩니다. <Link href="/classes" className="underline">기간 초기화</Link></p>
    </form>
    {parsed.error || result?.error ? <p role="alert" className="rounded-lg bg-red-50 p-5 text-red-700">{parsed.error ?? "수업 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}</p> : <>
      <p className="text-sm text-neutral-600">총 {result?.count ?? 0}개 수업</p>
      {!result?.data?.length ? <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-600">조회 조건에 맞는 수업이 없습니다. 날짜를 바꾸거나 새 수업을 등록하세요.</div> :
        <ul className="divide-y divide-neutral-200 border-y border-neutral-200">{result.data.map(session => <li key={session.id}>
          <Link href={"/classes/" + session.id} className="block px-2 py-5 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-black">
            <div className="flex items-start justify-between gap-4">
              <h2 className="min-w-0 break-words text-lg font-bold text-neutral-950">{session.title}</h2>
              <span className={"shrink-0 rounded px-2 py-1 text-xs font-semibold " + (session.status === "cancelled" ? "bg-neutral-100 text-neutral-600" : "bg-accent text-black")}>{session.status === "cancelled" ? "취소" : "예정"}</span>
            </div>
            <p className="mt-2 break-words text-sm text-neutral-600">{session.location}</p>
            <p className="mt-3 text-sm text-neutral-800">{formatClassDate(session.start_at)} ~ {formatClassDate(session.end_at)}</p>
            {session.created_by === profile.id && <p className="mt-2 text-xs text-black">내가 등록한 수업</p>}
          </Link>
        </li>)}</ul>}
      {filters && <nav aria-label="수업 목록 페이지" className="flex items-center justify-between gap-3 text-sm">
        {filters.page > 1 ? <Link href={link(filters.page - 1)} className="rounded-lg border px-4 py-3">이전</Link> : <span />}
        <span>{filters.page} 페이지</span>
        {filters.page * CLASS_PAGE_SIZE < (result?.count ?? 0) ? <Link href={link(filters.page + 1)} className="rounded-lg border px-4 py-3">다음</Link> : <span />}
      </nav>}
    </>}
  </div>;
}
