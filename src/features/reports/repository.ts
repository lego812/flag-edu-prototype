import type { SupabaseClient } from "@supabase/supabase-js";
import type { Report, Template } from "./model";
import { addDays, isDate } from "@/features/classes/dates";
import { isUuid } from "@/features/classes/model";

export const REPORT_SELECT =
  "*, class_sessions!inner(title,location,start_at,end_at,status,has_time), profiles!reports_author_id_fkey(name), report_answers(field_id,value), report_attachments(id,field_id,storage_path,original_filename)";
export async function getTemplate(client: SupabaseClient, id: string) {
  const { data, error } = await client
    .from("template_versions")
    .select("*,template_fields(*,field_options(*))")
    .eq("id", id)
    .single<Template>();
  if (error || !data) throw new Error("템플릿을 불러오지 못했습니다.");
  data.template_fields.sort((a, b) => a.sort_order - b.sort_order);
  data.template_fields.forEach((f) =>
    f.field_options.sort((a, b) => a.sort_order - b.sort_order),
  );
  return data;
}
export async function getReport(client: SupabaseClient, id: string) {
  return client
    .from("reports")
    .select(REPORT_SELECT)
    .eq("id", id)
    .maybeSingle<Report>();
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
    status: value("status") || "all",
    author: value("author"),
    session: value("session"),
    page: Number(value("page") || "1"),
  };
  if (
    (f.from && !isDate(f.from)) ||
    (f.to && (!isDate(f.to) || f.to >= "9999-12-31")) ||
    (f.from && f.to && f.from > f.to) ||
    !["all", "draft", "submitted", "confirmed"].includes(f.status) ||
    (f.author && !isUuid(f.author)) ||
    (f.session && !isUuid(f.session)) ||
    !Number.isInteger(f.page) ||
    f.page < 1 ||
    f.page > 100000
  )
    throw new Error("조회 조건을 확인해 주세요.");
  return f;
}
export function listReports(
  client: SupabaseClient,
  org: string,
  f: ReportFilters,
  author?: string,
  limit = 20,
) {
  let q = client
    .from("reports")
    .select(REPORT_SELECT, { count: "exact" })
    .eq("organization_id", org);
  if (author || f.author) q = q.eq("author_id", author || f.author);
  if (f.session) q = q.eq("class_session_id", f.session);
  if (f.from) q = q.gte("class_sessions.start_at", f.from + "T00:00:00+09:00");
  if (f.to)
    q = q.lt("class_sessions.start_at", addDays(f.to, 1) + "T00:00:00+09:00");
  if (f.status === "confirmed") q = q.not("confirmed_at", "is", null);
  else if (f.status !== "all")
    q = q.eq("status", f.status).is("confirmed_at", null);
  return q
    .order("updated_at", { ascending: false })
    .order("id")
    .range((f.page - 1) * limit, f.page * limit - 1)
    .returns<Report[]>();
}
