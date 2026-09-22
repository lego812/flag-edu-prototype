import { formatClassDate } from "@/features/classes/dates";

export function ReportMetadata({
  name,
  createdAt,
}: {
  name: string;
  createdAt: string;
}) {
  return (
    <p className="text-sm text-neutral-600">
      작성자 {name} · 작성일시{" "}
      <time dateTime={createdAt}>{formatClassDate(createdAt)}</time>
    </p>
  );
}
