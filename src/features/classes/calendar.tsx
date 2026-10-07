import Link from "next/link";
import { addDays, monthRange, seoulDateKey } from "./dates";
import type { ClassCalendarSession } from "./model";
import { CLASS_STATUS, ClassSessionCard } from "./session-card";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const STATUS_ORDER = ["scheduled", "completed", "cancelled"] as const;

export function ClassCalendar({
  month,
  selectedDate,
  status,
  sessions,
}: {
  month: string;
  selectedDate: string;
  status: "all" | ClassCalendarSession["status"];
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
  const selectedSessions = byDate.get(selectedDate) ?? [];
  const dateHref = (date: string) =>
    `/classes?${new URLSearchParams({ view: "calendar", month, status, date })}`;

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
            const statusCounts = STATUS_ORDER.map((status) => ({
              status,
              count: daySessions.filter((session) => session.status === status).length,
            })).filter(({ count }) => count > 0);
            return (
              <div
                key={date ?? `empty-${index}`}
                className={`min-h-16 border-r border-t border-neutral-200 p-1 text-left md:min-h-24 md:p-2 ${date === selectedDate ? "bg-neutral-100" : ""}`}
              >
                {date && (
                  <Link
                    href={dateHref(date)}
                    aria-current={date === selectedDate ? "date" : undefined}
                    aria-label={`${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일, 수업 ${daySessions.length}개`}
                    className="block min-h-14 rounded-lg p-1 focus-visible:outline-2 focus-visible:outline-black md:min-h-20"
                  >
                    <div className={`text-xs font-semibold ${index % 7 === 0 ? "text-red-600" : "text-neutral-700"}`}>
                      {Number(date.slice(-2))}
                    </div>
                    {daySessions.length > 0 && (
                      <div className="mt-2 flex flex-col items-start gap-1">
                        {statusCounts.map(({ status, count }) => (
                          <span
                            key={status}
                            role="img"
                            aria-label={`${CLASS_STATUS[status].label} ${count}개`}
                            className="inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span
                              aria-hidden="true"
                              className={`size-2 shrink-0 rounded-full ${CLASS_STATUS[status].marker}`}
                            />
                            <span className="text-[11px] font-bold text-neutral-600">
                              {count}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3" aria-label="선택한 날짜의 수업 목록">
        <h2 className="text-lg font-bold">
          {Number(selectedDate.slice(5, 7))}월 {Number(selectedDate.slice(8, 10))}일 수업
        </h2>
        {selectedSessions.length ? (
          <ul className="grid grid-cols-1 gap-3">
            {selectedSessions.map((session) => (
              <li key={session.id}>
                <ClassSessionCard session={session} compact />
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-300 p-6 text-center text-sm text-neutral-600">
            선택한 날짜에 수업이 없습니다.
          </p>
        )}
      </section>
    </div>
  );
}
