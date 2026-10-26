import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report, ReportSummary, Template } from "./model";
import { compareAttachmentsByUpload } from "./model";
import { addDays, isDate } from "@/features/classes/dates";
import { isUuid } from "@/features/classes/model";

export const REPORT_SELECT =
  "*, class_sessions!inner(title,location,start_at,end_at,status,has_time), profiles!reports_author_id_fkey(name), report_answers(field_id,value), report_attachments(id,field_id,storage_path,original_filename,file_size,created_at)";

export const REPORT_SUMMARY_SELECT =
  "id,author_id,created_at,class_sessions!inner(title,location,start_at,has_time),profiles!reports_author_id_fkey(name)";

export async function listReportAuthors(client: SupabaseClient, ids?: string[]) {
  const { data, error } = await client.rpc("list_report_authors", {
    p_author_ids: ids ?? null,
  });
  // The RPC returns TABLE(id uuid, name text); this client has no generated schema.
  return { data: data as { id: string; name: string }[] | null, error };
}

// A coach cannot select another member's private profile. Resolve only the
// display names missing from the embedded join, in one bounded batch.
async function resolveAuthorNames(
  client: SupabaseClient,
  reports: Pick<Report, "author_id" | "profiles">[],
) {
  const missing = reports.filter((report) => !report.profiles);
  if (!missing.length) return;
  const { data, error } = await listReportAuthors(client, [...new Set(missing.map(r => r.author_id))]);
  if (error) throw new Error("보고서 작성자 조회 실패");
  const names = new Map(data?.map(author => [author.id, author.name]));
  for (const report of missing) report.profiles = { name: names.get(report.author_id) ?? "알 수 없는 작성자" };
}

function sortReportAttachments(report: Report) {
  report.report_attachments.sort(compareAttachmentsByUpload);
  return report;
}
export async function getTemplate(client: SupabaseClient, id: string, workspaceId?: string) {
  let query = client
    .from("template_versions")
    .select("*,template_fields(*,field_options(*))")
    .eq("id", id);
  if (workspaceId) query = query.eq("organization_id", workspaceId).is("hidden_at", null);
  const { data, error } = await query.single<Template>();
  if (error || !data) throw new Error("템플릿을 불러오지 못했습니다.");
  data.template_fields.sort((a, b) => a.sort_order - b.sort_order);
  data.template_fields.forEach((f) =>
    f.field_options.sort((a, b) => a.sort_order - b.sort_order),
  );
  return data;
}
export async function getReport(client: SupabaseClient, id: string) {
  const result = await client
    .from("reports")
    .select(REPORT_SELECT)
    .eq("id", id)
    .maybeSingle<Report>();
  if (result.data) {
    sortReportAttachments(result.data);
    await resolveAuthorNames(client, [result.data]);
  }
  return result;
}
export type ReportFilters = {
  from: string;
  to: string;
  status: string;
  author: string;
  session: string;
  page: number;
};
export function reportFilters(
  params: Record<string, string | string[] | undefined>,
): ReportFilters {
  const value = (key: string) =>
    typeof params[key] === "string" ? (params[key] as string) : "";
  const f = {
    from: value("from"),
    to: value("to"),
    status: "all",
    author: value("author"),
    session: value("session"),
    page: Number(value("page") || "1"),
  };
  if (
    (f.from && !isDate(f.from)) ||
    (f.to && (!isDate(f.to) || f.to >= "9999-12-31")) ||
    (f.from && f.to && f.from > f.to) ||
    (f.author && !isUuid(f.author)) ||
    (f.session && !isUuid(f.session)) ||
    !Number.isInteger(f.page) ||
    f.page < 1 ||
    f.page > 100000
  )
    throw new Error("조회 조건을 확인해 주세요.");
  return f;
}
export async function listReports(
  client: SupabaseClient,
  org: string,
  f: ReportFilters,
  author?: string,
  limit = 20,
) {
  await client.rpc("sync_completed_class_sessions", {
    p_organization_id: org,
  });
  const result = await reportListQuery(client, org, f, author, limit, REPORT_SELECT)
    .returns<Report[]>();
  result.data?.forEach(sortReportAttachments);
  if (result.data) await resolveAuthorNames(client, result.data);
  return result;
}

// Keep identical tenant/author/date/pagination constraints for UI and exports.
function reportListQuery(
  client: SupabaseClient,
  org: string,
  f: ReportFilters,
  author: string | undefined,
  limit: number,
  select: string,
) {
  let q = client
    .from("reports")
    .select(select, { count: "exact" })
    .eq("organization_id", org);
  if (author || f.author) q = q.eq("author_id", author || f.author);
  if (f.session) q = q.eq("class_session_id", f.session);
  if (f.from) q = q.gte("class_sessions.start_at", f.from + "T00:00:00+09:00");
  if (f.to)
    q = q.lt("class_sessions.start_at", addDays(f.to, 1) + "T00:00:00+09:00");
  return q
    .order("updated_at", { ascending: false })
    .order("id")
    .range((f.page - 1) * limit, f.page * limit - 1);
}

export async function listReportSummaries(
  client: SupabaseClient,
  org: string,
  f: ReportFilters,
  author?: string,
) {
  await client.rpc("sync_completed_class_sessions", { p_organization_id: org });
  const result = await reportListQuery(client, org, f, author, 20, REPORT_SUMMARY_SELECT)
    .returns<ReportSummary[]>();
  if (result.data) await resolveAuthorNames(client, result.data);
  return result;
}
