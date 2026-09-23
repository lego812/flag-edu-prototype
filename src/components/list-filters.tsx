"use client";

import { useId, useState, type ReactNode } from "react";

export function ListFilters({
  children,
  from,
  to,
  selectedLabel,
}: {
  children: ReactNode;
  from?: string;
  to?: string;
  selectedLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const date = (value: string) => {
    const [, month, day] = value.split("-");
    return `${Number(month)}월 ${Number(day)}일`;
  };
  const period =
    from && to
      ? `${date(from)} ~ ${date(to)}`
      : from
        ? `${date(from)}부터`
        : to
          ? `${date(to)}까지`
          : "전체 기간";
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-neutral-600">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="min-h-11 rounded border border-neutral-200 bg-white px-3 py-2 font-medium hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-black"
        >
          {period}
        </button>
        <span aria-hidden="true" className="h-4 border-l border-neutral-300" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen(!open)}
          className="flex min-h-11 items-center gap-1.5 rounded px-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-black"
        >
          필터
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M3 5h14M3 10h14M3 15h14" />
            <path d="M7 3v4M13 8v4M7 13v4" />
          </svg>
        </button>
      </div>
      {selectedLabel && (
        <p className="mt-2 text-sm font-medium">{selectedLabel}</p>
      )}
      <div
        id={panelId}
        hidden={!open}
        className="mt-3 border-y border-neutral-200 py-4"
      >
        {children}
      </div>
    </div>
  );
}
