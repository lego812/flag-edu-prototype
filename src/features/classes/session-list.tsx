import Link from "next/link";
import { formatClassTime, seoulDateKey } from "./dates";
import type { ClassCalendarSession } from "./model";
import { CLASS_STATUS } from "./session-card";

export function ClassSessionList({ sessions }: { sessions: ClassCalendarSession[] }) {
  const dates = new Map<string, ClassCalendarSession[]>();
  for (const session of sessions) {
    const date = seoulDateKey(session.start_at);
    const group = dates.get(date) ?? [];
    group.push(session);
    dates.set(date, group);
  }

  return (
    <ul aria-label="날짜별 수업 목록" className="space-y-3">
      {[...dates].map(([date, group]) => (
        <li key={date} className="rounded-[2rem] bg-white px-5 py-5 sm:px-6">
          <h2 className="mb-3 font-bold text-neutral-950">
            <time dateTime={date}>{Number(date.slice(5, 7))}월 {Number(date.slice(8))}일</time>
          </h2>
          <ul className="divide-y divide-neutral-100">
            {group.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/classes/${session.id}`}
                  className="flex min-h-16 items-center justify-between gap-3 rounded-lg py-3 transition hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-black"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="break-words font-bold text-neutral-950">{session.title}</h3>
                    <p className="mt-0.5 break-words text-sm text-neutral-500">{session.location}</p>
                  </div>
                  <p className="shrink-0 whitespace-nowrap text-xs text-neutral-700 sm:text-sm">
                    {CLASS_STATUS[session.status].label} · {session.has_time === false ? "시간 미정" : formatClassTime(session.start_at)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
