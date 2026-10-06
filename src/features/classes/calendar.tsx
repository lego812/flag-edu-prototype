import Link from "next/link";
import {
  addDays,
  formatClassTime,
  monthRange,
  seoulDateKey,
} from "./dates";
import type { ClassCalendarSession } from "./model";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function ClassCalendar({
  month,
  sessions,
}: {
  month: string;
  sessions: ClassCalendarSession[];
}) {
  const { from, to } = monthRange(month);
  const firstWeekday = new Date(`${from}T00:00:00Z`).getUTCDay();
  const dates = Array.from(
    { length: firstWeekday + Number(to.slice(-2)) },
    (_, index) => (index < firstWeekday ? null : addDays(from, index - firstWeekday)),
  );
  while (dates.length % 7) dates.push(null);
  const byDate = new Map<string, ClassCalendarSession[]>();
  for (const session of sessions) {
    const key = seoulDateKey(session.start_at);
    byDate.set(key, [...(byDate.get(key) ?? []), session]);
  }
  const activeDates = dates.filter(
    (date): date is string => Boolean(date && byDate.get(date)?.length),
  );

  return (
    <div className="space-y-6">
      <section aria-label={`${Number(month.slice(0, 4))}년 ${Number(month.slice(5))}월 수업 캘린더`}>
        <div className="grid grid-cols-7 border-b border-l border-neutral-200 bg-white text-center text-xs font-semibold text-neutral-500">
          {WEEKDAYS.map((weekday, index) => (
            <div
              key={weekday}
              className={`border-r border-t border-neutral-200 py-2 ${index === 0 ? "text-red-600" : ""}`}
            >
              {weekday}
            </div>
          ))}
          {dates.map((date, index) => {
            const daySessions = date ? byDate.get(date) ?? [] : [];
            return (
              <div
                key={date ?? `empty-${index}`}
                className="min-h-16 border-r border-t border-neutral-200 p-1 text-left md:min-h-28 md:p-2"
              >
                {date && (
                  <>
                    <div className={`text-xs font-semibold ${index % 7 === 0 ? "text-red-600" : "text-neutral-700"}`}>
                      {Number(date.slice(-2))}
                    </div>
                    {daySessions.length > 0 && (
                      <div className="mt-1 md:hidden">
                        <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-black">
                          {daySessions.length}
                        </span>
                      </div>
                    )}
                    <div className="mt-1 hidden space-y-1 md:block">
                      {daySessions.map((session) => (
                        <Link
                          key={session.id}
                          href={`/classes/${session.id}`}
                          title={`${session.title} · ${session.location}`}
                          className={`block truncate rounded-md px-1.5 py-1 text-[11px] font-medium leading-tight hover:brightness-95 ${session.status === "cancelled" ? "bg-neutral-100 text-neutral-500 line-through" : "bg-amber-100 text-neutral-900"}`}
                        >
                          {session.status === "cancelled" && (
                            <span className="sr-only">취소 </span>
                          )}
                          {session.has_time === false ? "미정" : formatClassTime(session.start_at)} {session.title}
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 md:hidden" aria-label="날짜별 수업 목록">
        {activeDates.map((date) => (
          <div key={date} className="surface p-4">
            <h2 className="text-sm font-bold">
              {Number(date.slice(5, 7))}월 {Number(date.slice(8, 10))}일
            </h2>
            <ul className="mt-2 divide-y divide-neutral-100">
              {byDate.get(date)!.map((session) => (
                <li key={session.id}>
                  <Link href={`/classes/${session.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{session.title}</span>
                      <span className="block truncate text-xs text-neutral-500">{session.location}</span>
                    </span>
                    <span className="shrink-0 text-xs font-medium text-neutral-700">
                      {session.status === "cancelled" && "취소 · "}
                      {session.has_time === false ? "시간 미정" : formatClassTime(session.start_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
