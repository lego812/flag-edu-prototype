import Link from "@/components/feedback-link";
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
