import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { isUuid } from "@/features/classes/model";
import { requireMaster } from "@/features/master/access";
import { dateTime, type MasterReport } from "@/features/master/model";
import { ReportReader } from "@/features/reports/reader";
import { ReportMutationProvider } from "@/features/reports/mutation-context";
import { reportStatus } from "@/features/reports/model";
export default async function MasterReportPage({
  params,
}: {
  params: Promise<{ id: string; reportId: string }>;
}) {
  const { supabase } = await requireMaster();
  const { id, reportId } = await params;
  if (!isUuid(id) || !isUuid(reportId)) notFound();
  const { data, error } = await supabase.rpc("master_report", {
    p_workspace_id: id,
    p_report_id: reportId,
  });
  if (error) throw new Error("보고서를 불러오지 못했습니다.");
  if (!data) notFound();
  const { workspace, report, fields } = data as MasterReport;
  const attachments = await Promise.all(
    report.report_attachments.map(async (a) => {
      const result = await supabase.storage
        .from("report-images")
        .createSignedUrl(a.storage_path, 600);
      return { ...a, url: result.data?.signedUrl };
    }),
  );
  return (
    <>
      <Link
        href={`/manage/all-workspaces/${id}?section=reports`}
        className="text-sm underline"
      >
        {workspace.name} 보고서 목록
      </Link>
      <article className="surface mx-auto w-full max-w-3xl px-5 py-6 sm:px-9">
        <header className="space-y-3 border-b border-neutral-200 pb-6">
          <h1 className="break-words text-3xl font-bold">
            {report.class_sessions.title}
          </h1>
          <p className="text-sm">
            {report.profiles.name} · {reportStatus(report)} · 조회 전용
          </p>
          <p className="text-sm text-neutral-600">
            작성일 {dateTime(report.created_at)} (한국 시간)
          </p>
          <p className="text-sm">
            수업:{" "}
            {dateTime(
              report.class_sessions.start_at,
              report.class_sessions.has_time !== false,
            )}{" "}
            · {report.class_sessions.location}
          </p>
          {report.class_sessions.status === "cancelled" && (
            <p className="text-sm text-red-700">취소된 수업의 보고서입니다.</p>
          )}
        </header>
        <ReportMutationProvider version={report.updated_at}>
          <ReportReader
            report={report}
            fields={fields}
            attachments={attachments}
          />
        </ReportMutationProvider>
      </article>
    </>
  );
}
