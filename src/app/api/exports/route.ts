import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import {
  getTemplate,
  listReports,
  reportFilters,
} from "@/features/reports/repository";
import {
  exportRows,
  generateExport,
  generateReportPdf,
} from "@/features/exports/generate";
import {
  MAX_PDF_PHOTO_BYTES,
  totalPhotoBytes,
} from "@/features/exports/policy";
export const runtime = "nodejs";
export const maxDuration = 300;

function streamBytes(bytes: Uint8Array) {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      const next = bytes.subarray(offset, Math.min(offset + 64 * 1024, bytes.length));
      offset += next.length;
      controller.enqueue(next);
    },
  });
}
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
  if (format === "pdf" && totalPhotoBytes(reports) > MAX_PDF_PHOTO_BYTES)
    return NextResponse.json(
      {
        error:
          "PDF에 포함할 사진이 100MiB를 초과합니다. 기간이나 사진 수를 줄여 주세요.",
      },
      { status: 400 },
    );
  try {
    const templates = new Map(
      await Promise.all(
        [...new Set(reports.map((r) => r.template_version_id))].map(
          async (id) => [id, await getTemplate(supabase, id)] as const,
        ),
      ),
    );
    const bytes =
      format === "pdf"
        ? await generateReportPdf(reports, templates, async (attachment) => {
            const { data, error: downloadError } = await supabase.storage
              .from("report-images")
              .download(attachment.storage_path);
            if (downloadError || !data) return null;
            return new Uint8Array(await data.arrayBuffer());
          })
        : await generateExport("xlsx", exportRows(reports, templates));
    const mime =
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    return new Response(streamBytes(bytes), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `attachment; filename="flag-edu-${timestamp}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "파일 생성에 실패했습니다. 기간을 줄여 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
