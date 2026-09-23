import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { getReport, getTemplate } from "@/features/reports/repository";
import { ReportEditor } from "@/features/reports/editor";
import { Photos } from "@/features/reports/photos";
import { ReportMetadata } from "@/features/reports/metadata";
import { isUuid } from "@/features/classes/model";
export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const { supabase, profile } = await requireCurrentProfile();
  if (!isUuid(id)) notFound();
  const { data: report, error } = await getReport(supabase, id);
  if (error) throw new Error("보고서 조회 실패");
  if (!report) notFound();
  const template = await getTemplate(supabase, report.template_version_id);
  const mine = report.author_id === profile.id;
  const editing = mine && (await searchParams).edit === "1";
  const attachments = await Promise.all(
    report.report_attachments.map(async (a) => {
      const { data } = await supabase.storage
        .from("report-images")
        .createSignedUrl(a.storage_path, 600);
      return { ...a, url: data?.signedUrl };
    }),
  );
  return (
    <>
      <Link
        href={mine ? "/reports" : "/admin-reports"}
        className="text-sm underline"
      >
        보고서 목록
      </Link>
      <header className="space-y-2">
        <h1 className="break-words text-2xl font-bold">
          {report.class_sessions.title}
        </h1>
        <ReportMetadata
          name={report.profiles.name}
          createdAt={report.created_at}
        />
        {report.class_sessions.status === "cancelled" && (
          <p className="text-red-700">
            취소된 수업입니다. 기존 기록은 유지되며 새 제출은 불가능합니다.
          </p>
        )}
      </header>
      {mine && (
        <Link
          className="btn-secondary w-fit"
          href={editing ? `/reports/${id}` : `/reports/${id}?edit=1`}
        >
          {editing ? "조회로 돌아가기" : "수정"}
        </Link>
      )}
      {editing ? (
        <ReportEditor report={report} fields={template.template_fields} />
      ) : (
        <dl className="space-y-5">
          {template.template_fields
            .filter((f) => f.field_type !== "photo")
            .map((f) => {
              const value = report.report_answers.find(
                (a) => a.field_id === f.id,
              )?.value;
              return (
                <div key={f.id}>
                  <dt className="font-semibold">{f.label}</dt>
                  <dd className="mt-1 whitespace-pre-wrap break-words">
                    {value == null
                      ? "미입력"
                      : Array.isArray(value)
                        ? value.join(", ")
                        : String(value)}
                  </dd>
                </div>
              );
            })}
        </dl>
      )}
      <Photos
        reportId={id}
        fields={template.template_fields}
        attachments={attachments}
        editable={editing}
      />
    </>
  );
}
