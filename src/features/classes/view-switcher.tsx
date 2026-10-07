"use client";

import Link from "next/link";

export function ClassViewSwitcher({
  view,
  listHref,
  calendarHref,
}: {
  view: "list" | "calendar";
  listHref: string;
  calendarHref: string;
}) {
  const remember = (next: "list" | "calendar") => {
    document.cookie = `flag-edu-class-view=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <nav
      aria-label="수업 보기 방식"
      className="grid grid-cols-2 rounded-2xl bg-neutral-200 p-1"
    >
      <Link
        href={listHref}
        onClick={() => remember("list")}
        aria-current={view === "list" ? "page" : undefined}
        className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${view === "list" ? "bg-white text-black shadow-sm" : "text-neutral-600 hover:text-black"}`}
      >
        목록
      </Link>
      <Link
        href={calendarHref}
        onClick={() => remember("calendar")}
        aria-current={view === "calendar" ? "page" : undefined}
        className={`flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors ${view === "calendar" ? "bg-white text-black shadow-sm" : "text-neutral-600 hover:text-black"}`}
      >
        캘린더
      </Link>
    </nav>
  );
}
