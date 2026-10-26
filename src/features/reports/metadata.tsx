import { formatClassDate } from "@/features/classes/dates";

export function ReportMetadata({
  name,
  createdAt,
  classStartAt,
  classHasTime = true,
  location,
}: {
  name: string;
  createdAt: string;
  classStartAt: string;
  classHasTime?: boolean;
  location: string;
}) {
  return (
    <div className="space-y-1 text-sm">
      <p>
        <span className="inline-block min-w-20 font-semibold">수업일시</span>
        <time dateTime={classStartAt}>
          {formatClassDate(classStartAt, classHasTime)}
        </time>
      </p>
      <p>
        <span className="inline-block min-w-20 font-semibold">장소</span>
        {location}
      </p>
      <p>
        <span className="inline-block min-w-20 font-semibold">작성자</span>
        {name}
      </p>
      <p className="pt-1 text-xs text-neutral-500">
        상세정보: <time dateTime={createdAt}>{formatClassDate(createdAt)}</time> 작성
      </p>
    </div>
  );
}
