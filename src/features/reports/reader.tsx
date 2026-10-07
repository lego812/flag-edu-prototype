import type { Attachment, Field, Report } from "./model";
import { Photos } from "./photos";

function isEmpty(value: unknown) {
  return (
    value == null ||
    (typeof value === "string" && value.trim() === "") ||
    (Array.isArray(value) && value.length === 0)
  );
}

export function ReportReader({
  report,
  fields,
  attachments,
}: {
  report: Report;
  fields: Field[];
  attachments: Attachment[];
}) {
  return (
    <div className="divide-y divide-neutral-200/80">
      {fields.map((field) => {
        if (field.field_type === "photo") {
          return (
            <div key={field.id} className="py-6 sm:py-7">
              <Photos
                reportId={report.id}
                fields={[field]}
                attachments={attachments}
                editable={false}
                reading
              />
            </div>
          );
        }
        const value = report.report_answers.find(
          (answer) => answer.field_id === field.id,
        )?.value;
        const empty = isEmpty(value);
        const selected =
          field.field_type === "single_select" ||
          field.field_type === "multi_select";
        const compact =
          field.field_type === "number" || field.field_type === "date";
        const text = Array.isArray(value) ? value.join(", ") : String(value);
        return (
          <dl
            key={field.id}
            className={`min-w-0 py-6 sm:py-7 ${compact ? "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] items-baseline gap-x-4" : "space-y-2.5"}`}
          >
            <dt className="text-sm font-medium text-neutral-600 [overflow-wrap:anywhere]">
              {field.label}
            </dt>
            <dd className="min-w-0 whitespace-pre-wrap text-base leading-7 text-neutral-900 [overflow-wrap:anywhere] sm:text-[17px] sm:leading-8">
              {empty ? (
                <span className="text-sm text-neutral-500">미입력</span>
              ) : selected ? (
                <ul
                  aria-label={`${field.label} 선택값`}
                  className="flex flex-wrap gap-2"
                >
                  {(Array.isArray(value) ? value : [value]).map((choice, index) => (
                    <li
                      key={index}
                      className="max-w-full rounded-lg bg-neutral-100 px-3 py-1 text-sm leading-6 text-neutral-800"
                    >
                      {String(choice)}
                    </li>
                  ))}
                </ul>
              ) : field.field_type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(text) ? (
                <time dateTime={text}>{text.replaceAll("-", ".")}</time>
              ) : (
                text
              )}
            </dd>
          </dl>
        );
      })}
    </div>
  );
}
