import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import {
  getTemplate,
  listReports,
  reportFilters,
} from "@/features/reports/repository";
import { exportRows, generateExport } from "@/features/exports/generate";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const { supabase, profile } = await requireCurrentProfile();
  if (
    profile.role !== "admin" ||
    request.headers.get("origin") !== new URL(request.url).origin
  )
    return NextResponse.json(
      { error: "관리자만 사용할 수 있습니다." },
      { status: 403 },
    );
  let filters, format: "pdf" | "xlsx";
  try {
    const form = await request.formData();
    const type = form.get("format");
    if (type !== "pdf" && type !== "xlsx") throw new Error();
    format = type;
    filters = reportFilters(
      Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])),
    );
    filters.page = 1;
  } catch {
    return NextResponse.json(
      { error: "내보내기 조건을 확인해 주세요." },
      { status: 400 },
    );
  }
  const {
    data: reports,
    count,
    error,
  } = await listReports(
    supabase,
    profile.organization_id,
    filters,
    undefined,
    201,
  );
  if (error)
    return NextResponse.json(
      { error: "보고서를 조회하지 못했습니다." },
      { status: 500 },
    );
  if (!reports?.length || !count || count > 200)
    return NextResponse.json(
      {
        error:
          "한 번에 1~200개 보고서를 내보낼 수 있습니다. 기간과 조건을 조정해 주세요.",
      },
      { status: 400 },
    );
  const { data: job, error: jobError } = await supabase
    .from("export_jobs")
    .insert({
      organization_id: profile.organization_id,
      requested_by: profile.id,
      format,
      filters,
      status: "processing",
    })
    .select("id")
    .single();
  if (jobError || !job)
    return NextResponse.json(
      {
        error: "내보내기 이력을 생성하지 못했습니다. DB 설정을 확인해 주세요.",
      },
      { status: 500 },
    );
  const storagePath = `${profile.organization_id}/${profile.id}/${job.id}.${format}`;
  try {
    const templates = new Map(
      await Promise.all(
        [...new Set(reports.map((r) => r.template_version_id))].map(
          async (id) => [id, await getTemplate(supabase, id)] as const,
        ),
      ),
    );
    const bytes = await generateExport(format, exportRows(reports, templates));
    const mime =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const upload = await supabase.storage
      .from("report-exports")
      .upload(storagePath, bytes, { contentType: mime });
    if (upload.error) throw new Error("파일 저장에 실패했습니다.");
    const done = await supabase
      .from("export_jobs")
      .update({
        status: "completed",
        storage_path: storagePath,
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    if (done.error) throw new Error("완료 기록을 저장하지 못했습니다.");
    revalidatePath("/exports");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="flag-edu-${job.id}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    await supabase.storage.from("report-exports").remove([storagePath]);
    await supabase
      .from("export_jobs")
      .update({
        status: "failed",
        error_message: "생성 실패. 기간을 줄여 다시 시도해 주세요.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    revalidatePath("/exports");
    return NextResponse.json(
      { error: "파일 생성에 실패했습니다. 기간을 줄여 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
