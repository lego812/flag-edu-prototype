import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
import { revalidatePath } from "next/cache";
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
const sessionStatus = (
  sessions: { status: string } | { status: string }[],
) => (Array.isArray(sessions) ? sessions[0]?.status : sessions.status);
const conflictMessage = "다른 화면에서 보고서가 변경됐습니다. 새로고침 후 다시 시도해 주세요.";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("잘못된 요청입니다.", 403);
  if (!isUuid(id)) return fail("보고서를 찾을 수 없습니다.");
  if (Number(request.headers.get("content-length")) > 1200000)
    return fail("사진 크기가 너무 큽니다.");
  const form = await request.formData();
  const file = form.get("file");
  const field = form.get("field");
  if (
    !(file instanceof File) ||
    file.type !== "image/jpeg" ||
    file.size < 1 ||
    file.size > 1048576 ||
    typeof field !== "string" ||
    !isUuid(field)
  )
    return fail("1MiB 이하 JPG 사진만 허용합니다.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
    return fail("JPG 형식을 확인해 주세요.");
  let reportQuery = supabase
    .from("reports")
    .select("id,template_version_id,class_sessions!inner(status)")
    .eq("id", id);
  if (profile.role !== "admin") reportQuery = reportQuery.eq("author_id", profile.id);
  const { data: report } = await reportQuery.single();
  if (!report) return fail("보고서를 변경할 권한이 없습니다.", 403);
  if (sessionStatus(report.class_sessions) === "cancelled")
    return fail("취소된 수업의 보고서는 변경할 수 없습니다.", 409);
  const { data: target } = await supabase
    .from("template_fields")
    .select("id")
    .eq("id", field)
    .eq("template_version_id", report.template_version_id)
    .eq("field_type", "photo")
    .single();
  if (!target) return fail("사진 항목이 아닙니다.");
  const path = `${profile.organization_id}/${id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("report-images")
    .upload(path, bytes, { contentType: "image/jpeg", upsert: false });
  if (uploadError)
    return fail("사진 업로드에 실패했습니다. 다시 시도해 주세요.");
  const { data: changed, error } = await supabase.rpc("mutate_report_photo", {
    p_report_id: id,
    p_version: form.get("version") || null,
    p_operation: "insert",
    p_attachment: { field_id: field, storage_path: path, file_size: file.size },
  });
  if (error) {
    const cleanup = await supabase.storage.from("report-images").remove([path]);
    return fail(
      cleanup.error
        ? "사진 등록·정리에 실패했습니다. 관리자에게 문의해 주세요."
        : error.code === "PT409"
          ? conflictMessage
          : "사진을 등록하지 못했습니다. 최대 첨부 수를 확인해 주세요.",
      error.code === "PT409" ? 409 : 400,
    );
  }
  const { data: signed } = await supabase.storage
    .from("report-images")
    .createSignedUrl(path, 600);
  revalidatePath("/reports/" + id);
  return NextResponse.json({
    attachment: { ...changed.attachment, url: signed?.signedUrl },
    version: changed.version,
  });
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("잘못된 요청입니다.", 403);
  let attachmentId;
  let version;
  try {
    const body = await request.json();
    attachmentId = body.id;
    version = body.version;
  } catch {
    return fail("잘못된 요청입니다.");
  }
  if (!isUuid(id) || typeof attachmentId !== "string" || !isUuid(attachmentId))
    return fail("잘못된 사진입니다.");
  let reportQuery = supabase
    .from("reports")
    .select("id,class_sessions!inner(status)")
    .eq("id", id);
  if (profile.role !== "admin") reportQuery = reportQuery.eq("author_id", profile.id);
  const { data: report } = await reportQuery.single();
  if (!report) return fail("보고서를 변경할 권한이 없습니다.", 403);
  if (sessionStatus(report.class_sessions) === "cancelled")
    return fail("취소된 수업의 보고서는 변경할 수 없습니다.", 409);
  const { data: changed, error } = await supabase.rpc("mutate_report_photo", {
    p_report_id: id,
    p_version: typeof version === "string" ? version : null,
    p_operation: "delete",
    p_attachment: { id: attachmentId },
  });
  if (error || !changed)
    return fail(error?.code === "PT409" ? conflictMessage : "사진 기록 정리 실패. 다시 삭제를 시도해 주세요.", error?.code === "PT409" ? 409 : 400);
  const removed = await supabase.storage
    .from("report-images")
    .remove([changed.attachment.storage_path]);
  if (removed.error)
    return fail("사진 파일 정리에 실패했습니다. 관리자에게 문의해 주세요.");
  revalidatePath("/reports/" + id);
  return NextResponse.json({ ok: true, version: changed.version });
}
