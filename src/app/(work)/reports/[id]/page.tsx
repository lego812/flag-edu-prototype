import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { getReport, getTemplate } from "@/features/reports/repository";
import { ReportEditor } from "@/features/reports/editor";
import { Photos } from "@/features/reports/photos";
import { ReportMetadata } from "@/features/reports/metadata";
import { isUuid } from "@/features/classes/model";
import { ReportMutationProvider } from "@/features/reports/mutation-context";
import { ReportReader } from "@/features/reports/reader";
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
  const mutable =
    (mine || profile.role === "admin") &&
    report.class_sessions.status !== "cancelled";
  const editing = mutable && (await searchParams).edit === "1";
  const attachments = await Promise.all(
    report.report_attachments.map(async (a) => {
      const { data } = await supabase.storage
        .from("report-images")
        .createSignedUrl(a.storage_path, 600);
      return { ...a, url: data?.signedUrl };
    }),
  );
  return (
    <ReportMutationProvider version={report.updated_at}>
      <Link
        href={profile.role === "admin" ? "/admin-reports" : "/reports"}
        className="mx-auto block w-full max-w-3xl text-sm text-neutral-600 underline underline-offset-4"
      >
        보고서 목록
      </Link>
      <article
        className={editing ? "space-y-6" : "mx-auto w-full max-w-3xl rounded-3xl bg-white px-5 pb-1 pt-6 sm:px-9 sm:pt-8"}
      >
        <header className={editing ? "space-y-2" : "space-y-3 border-b border-neutral-200/80 pb-6 sm:pb-7"}>
          <div className="flex items-start justify-between gap-4">
            <h1 className="min-w-0 text-2xl font-bold leading-snug tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
              {report.class_sessions.title}
            </h1>
            {mutable && !editing && (
              <Link
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-700"
                href={`/reports/${id}?edit=1`}
              >
                수정
              </Link>
            )}
          </div>
          <ReportMetadata
            name={report.profiles.name}
            createdAt={report.created_at}
          />
          {report.class_sessions.status === "cancelled" && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
              취소된 수업입니다. 기존 기록은 유지되며 변경하거나 제출할 수 없습니다.
            </p>
          )}
        </header>
        {editing ? (
          <>
            <ReportEditor report={report} fields={template.template_fields} />
            <Photos
              reportId={id}
              fields={template.template_fields}
              attachments={attachments}
              editable
            />
          </>
        ) : (
          <ReportReader
            report={report}
            fields={template.template_fields}
            attachments={attachments}
          />
        )}
      </article>
    </ReportMutationProvider>
  );
}
