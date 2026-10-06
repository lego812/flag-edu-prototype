import Link from "next/link";
import { ListFilters } from "@/components/list-filters";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { ClassCalendar } from "@/features/classes/calendar";
import { addMonths, formatClassDate } from "@/features/classes/dates";
import {
  CLASS_PAGE_SIZE,
  classRepository,
} from "@/features/classes/repository";
import {
  parseClassCalendarFilters,
  parseClassFilters,
} from "@/features/classes/validation";

export const metadata = { title: "수업 목록" };
export default async function ClassesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  const params = await searchParams;
  const requestedView = params.view ?? "list";
  const view = requestedView === "calendar" ? "calendar" : "list";
  const viewError =
    requestedView === "list" || requestedView === "calendar"
      ? undefined
      : "올바른 보기 방식을 선택해 주세요.";
  const listParsed = view === "list" ? parseClassFilters(params) : null;
  const calendarParsed =
    view === "calendar" ? parseClassCalendarFilters(params) : null;
  const filters = listParsed?.filters;
  const calendarFilters = calendarParsed?.filters;
  const error = viewError ?? listParsed?.error ?? calendarParsed?.error;
  const repository = classRepository(supabase, profile);
  const result = error
    ? null
    : view === "calendar"
      ? await repository.calendar(calendarFilters!)
      : await repository.list(filters!);
  const link = (page: number) =>
    "/classes?" +
    new URLSearchParams({
      from: filters!.from,
      to: filters!.to,
      status: filters!.status,
      page: String(page),
    });
  const calendarLink = (month: string, status = calendarFilters?.status ?? "all") =>
    "/classes?" +
    new URLSearchParams({ view: "calendar", month, status }).toString();
  const calendarMonth =
    calendarFilters?.month ??
    (filters ? filters.from.slice(0, 7) : "");
  const listHref =
    calendarFilters?.status && calendarFilters.status !== "all"
      ? `/classes?status=${calendarFilters.status}`
      : "/classes";
  const calendarHref = calendarMonth
    ? calendarLink(calendarMonth, filters?.status ?? calendarFilters?.status)
    : "/classes?view=calendar";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-950">수업 일정</h1>
          <p className="mt-2 text-neutral-600">
            기관의 수업을 확인하고 일정을 등록하세요.
          </p>
        </div>
        <Link
          href="/classes/new"
          className="rounded-lg bg-black px-5 py-3 font-semibold text-white"
        >
          수업 등록
        </Link>
      </div>
      <nav
        aria-label="수업 보기 방식"
        className="grid grid-cols-2 rounded-2xl bg-neutral-200 p-1"
      >
        <Link
          href={listHref}
          aria-current={view === "list" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${view === "list" ? "bg-white text-black shadow-sm" : "text-neutral-600 hover:text-black"}`}
        >
          목록
        </Link>
        <Link
          href={calendarHref}
          aria-current={view === "calendar" ? "page" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${view === "calendar" ? "bg-white text-black shadow-sm" : "text-neutral-600 hover:text-black"}`}
        >
          캘린더
        </Link>
      </nav>

      {view === "list" && (
        <ListFilters from={filters?.from} to={filters?.to}>
          <form action="/classes" className="grid grid-cols-1 gap-4">
            <label className="min-w-0 text-sm font-medium">
              시작일
              <input
                aria-label="조회 시작일"
                type="date"
                name="from"
                required
                defaultValue={filters?.from}
                className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 p-3"
              />
            </label>
            <label className="min-w-0 text-sm font-medium">
              종료일
              <input
                aria-label="조회 종료일"
                type="date"
                name="to"
                required
                defaultValue={filters?.to}
                className="mt-2 block w-full min-w-0 rounded-lg border border-neutral-300 p-3"
              />
            </label>
            <label className="text-sm font-medium">
              상태
              <select
                name="status"
                defaultValue={filters?.status ?? "all"}
                className="mt-2 block w-full rounded-lg border border-neutral-300 bg-white p-3"
              >
                <option value="all">전체</option>
                <option value="scheduled">예정</option>
                <option value="cancelled">취소</option>
              </select>
            </label>
            <button className="self-end rounded-lg bg-black px-4 py-3 text-sm font-semibold text-white">
              조회
            </button>
            <p className="text-xs text-neutral-500">
              한국 시간의 수업 시작일 기준으로 조회합니다. 종료일도 포함됩니다.{" "}
              <Link href="/classes" className="underline">
                기간 초기화
              </Link>
            </p>
          </form>
        </ListFilters>
      )}

      {view === "calendar" && calendarFilters && (
        <div className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              href={calendarLink(addMonths(calendarFilters.month, -1))}
              aria-label="이전 달"
              className="flex size-11 items-center justify-center rounded-full border border-neutral-200 text-xl hover:bg-neutral-50"
            >
              ‹
            </Link>
            <h2 className="text-lg font-bold">
              {Number(calendarFilters.month.slice(0, 4))}년 {Number(calendarFilters.month.slice(5))}월
            </h2>
            <Link
              href={calendarLink(addMonths(calendarFilters.month, 1))}
              aria-label="다음 달"
              className="flex size-11 items-center justify-center rounded-full border border-neutral-200 text-xl hover:bg-neutral-50"
            >
              ›
            </Link>
          </div>
          <nav aria-label="수업 상태" className="flex justify-center gap-2">
            {(["all", "scheduled", "cancelled"] as const).map((status) => (
              <Link
                key={status}
                href={calendarLink(calendarFilters.month, status)}
                aria-current={calendarFilters.status === status ? "page" : undefined}
                className={`rounded-full px-4 py-2 text-xs font-semibold ${calendarFilters.status === status ? "bg-black text-white" : "bg-neutral-100 text-neutral-600"}`}
              >
                {{ all: "전체", scheduled: "예정", cancelled: "취소" }[status]}
              </Link>
            ))}
          </nav>
        </div>
      )}

      {error || result?.error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-5 text-red-700">
          {error ??
            "수업 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."}
        </p>
      ) : (
        <>
          <p className="text-sm text-neutral-600">
            {view === "calendar" && calendarFilters
              ? `${Number(calendarFilters.month.slice(5))}월 `
              : "총 "}
            {result?.count ?? 0}개 수업
          </p>
          {!result?.data?.length ? (
            <div className="rounded-lg border border-dashed border-neutral-300 p-10 text-center text-neutral-600">
              조회 조건에 맞는 수업이 없습니다. 날짜를 바꾸거나 새 수업을
              등록하세요.
            </div>
          ) : view === "calendar" && calendarFilters ? (
            <>
              <ClassCalendar month={calendarFilters.month} sessions={result.data} />
              {(result.count ?? 0) > result.data.length && (
                <p role="status" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
                  수업이 많아 앞의 1,000개만 표시했습니다. 상태로 나누어 확인해 주세요.
                </p>
              )}
            </>
          ) : (
            <ul className="grid grid-cols-1 gap-3">
              {result.data.map((session) => (
                <li key={session.id}>
                  <Link
                    href={"/classes/" + session.id}
                    className="block rounded-3xl border border-neutral-200 bg-white p-5 transition hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-black"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="min-w-0 break-words text-lg font-bold text-neutral-950">
                        {session.title}
                      </h2>
                      <span
                        className={
                          "shrink-0 rounded px-2 py-1 text-xs font-semibold " +
                          (session.status === "cancelled"
                            ? "bg-neutral-100 text-neutral-600"
                            : "bg-accent text-black")
                        }
                      >
                        {session.status === "cancelled" ? "취소" : "예정"}
                      </span>
                    </div>
                    <p className="mt-2 break-words text-sm text-neutral-600">
                      {session.location}
                    </p>
                    <p className="mt-3 text-sm text-neutral-800">
                      {formatClassDate(session.start_at, session.has_time)}
                      {session.has_time !== false && (
                        <> ~ {formatClassDate(session.end_at)}</>
                      )}
                    </p>
                    {session.created_by === profile.id && (
                      <p className="mt-2 text-xs text-black">
                        내가 등록한 수업
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {view === "list" && filters && (
            <nav
              aria-label="수업 목록 페이지"
              className="flex items-center justify-between gap-3 text-sm"
            >
              {filters.page > 1 ? (
                <Link
                  href={link(filters.page - 1)}
                  className="rounded-lg border px-4 py-3"
                >
                  이전
                </Link>
              ) : (
                <span />
              )}
              <span>{filters.page} 페이지</span>
              {filters.page * CLASS_PAGE_SIZE < (result?.count ?? 0) ? (
                <Link
                  href={link(filters.page + 1)}
                  className="rounded-lg border px-4 py-3"
                >
                  다음
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
