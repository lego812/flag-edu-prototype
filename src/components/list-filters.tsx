import type { ReactNode } from "react";

export function ListFilters({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-3xl border border-neutral-200 bg-white">
      <summary className="cursor-pointer rounded-3xl px-5 py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-black">
        조회 필터
        <span className="ml-3 font-normal text-neutral-500">조건 변경</span>
      </summary>
      <div className="border-t border-neutral-100 p-5">{children}</div>
    </details>
  );
}
