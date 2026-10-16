import Link from "@/components/feedback-link";
import { FilterForm } from "@/components/filter-form";
import { SubmitButton } from "@/components/submit-button";
export function Search({
  path,
  q,
  label,
}: {
  path: string;
  q: string;
  label: string;
}) {
  return (
    <FilterForm action={path} className="flex flex-wrap items-end gap-3">
      <label className="min-w-0 flex-1 text-sm font-medium">
        {label}
        <input
          className="mt-2 w-full rounded-xl border border-neutral-300 bg-white px-4 py-3"
          name="q"
          type="search"
          defaultValue={q}
          maxLength={100}
        />
      </label>
      <SubmitButton className="btn" pendingLabel="조회 중…">
        검색
      </SubmitButton>
    </FilterForm>
  );
}
export function Pagination({
  path,
  page,
  total,
  query = {},
}: {
  path: string;
  page: number;
  total: number;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  const url = (n: number) =>
    `${path}?${new URLSearchParams({ ...query, page: String(n) })}`;
  return (
    <nav
      aria-label="페이지"
      className="flex flex-wrap items-center justify-between gap-4 text-sm"
    >
      <span>
        {total}건 · {page}페이지 / {pages}페이지
      </span>
      <div className="flex gap-5">
        {page > 1 && (
          <Link href={url(page - 1)} className="min-h-11 py-3 underline">
            이전
          </Link>
        )}
        {page < pages && (
          <Link href={url(page + 1)} className="min-h-11 py-3 underline">
            다음
          </Link>
        )}
      </div>
    </nav>
  );
}
