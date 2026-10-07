import Link from "next/link";
import { formatClassDate, formatClassTime } from "./dates";
import type { ClassCalendarSession } from "./model";

export const CLASS_STATUS = {
  scheduled: {
    label: "예정",
    badge: "bg-amber-100 text-amber-950",
    marker: "bg-amber-400",
  },
  cancelled: {
    label: "취소",
    badge: "bg-red-100 text-red-800",
    marker: "bg-red-500",
  },
  completed: {
    label: "완료",
    badge: "bg-emerald-100 text-emerald-800",
    marker: "bg-emerald-500",
  },
} as const;

export function ClassStatusBadge({
  status,
}: {
  status: ClassCalendarSession["status"];
}) {
  const config = CLASS_STATUS[status];
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${config.badge}`}
    >
      {config.label}
    </span>
  );
}

export function ClassSessionCard({
  session,
  mine = false,
  compact = false,
}: {
  session: ClassCalendarSession;
  mine?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/classes/${session.id}`}
      className={`block border border-neutral-200 bg-white transition hover:border-neutral-400 focus-visible:outline-2 focus-visible:outline-black ${compact ? "rounded-2xl p-4" : "rounded-3xl p-5"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="break-words font-bold text-neutral-950">
            {session.title}
          </h2>
          <p className="mt-1 break-words text-sm text-neutral-600">
            {session.location}
          </p>
        </div>
        <ClassStatusBadge status={session.status} />
      </div>
      <p className="mt-3 text-sm text-neutral-800">
        {session.has_time === false
          ? formatClassDate(session.start_at, false)
          : `${formatClassDate(session.start_at, false)} · ${formatClassTime(session.start_at)} ~ ${formatClassTime(session.end_at)}`}
      </p>
      {mine && <p className="mt-2 text-xs font-semibold">내가 등록한 일정</p>}
    </Link>
  );
}
