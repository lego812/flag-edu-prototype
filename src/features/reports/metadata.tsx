export function ReportMetadata({
  name,
  createdAt,
}: {
  name: string;
  createdAt: string;
}) {
  return (
    <p className="text-sm text-neutral-600">
      {name} ·{" "}
      <time dateTime={createdAt}>
        {new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Seoul",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
          .format(new Date(createdAt))
          .replaceAll("-", ".")}
      </time>
    </p>
  );
}
