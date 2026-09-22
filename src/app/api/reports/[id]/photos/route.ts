import { NextResponse } from "next/server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
import { revalidatePath } from "next/cache";
const fail = (error: string, status = 400) =>
  NextResponse.json({ error }, { status });
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
  const { data: report } = await supabase
    .from("reports")
    .select("id,template_version_id")
    .eq("id", id)
    .eq("author_id", profile.id)
    .single();
  if (!report) return fail("본인 보고서만 변경할 수 있습니다.", 403);
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
  const { error } = await supabase
    .from("report_attachments")
    .insert({
      organization_id: profile.organization_id,
      report_id: id,
      field_id: field,
      storage_path: path,
      original_filename: "photo.jpg",
      mime_type: "image/jpeg",
      file_size: file.size,
    });
  if (error) {
    const cleanup = await supabase.storage.from("report-images").remove([path]);
    return fail(
      cleanup.error
        ? "사진 등록·정리에 실패했습니다. 관리자에게 문의해 주세요."
        : "사진을 등록하지 못했습니다. 최대 첨부 수를 확인해 주세요.",
    );
  }
  revalidatePath("/reports/" + id);
  return NextResponse.json({ ok: true });
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
  try {
    attachmentId = (await request.json()).id;
  } catch {
    return fail("잘못된 요청입니다.");
  }
  if (!isUuid(id) || typeof attachmentId !== "string" || !isUuid(attachmentId))
    return fail("잘못된 사진입니다.");
  const { data: report } = await supabase
    .from("reports")
    .select("id")
    .eq("id", id)
    .eq("author_id", profile.id)
    .single();
  if (!report) return fail("본인 보고서만 변경할 수 있습니다.", 403);
  const { data: a } = await supabase
    .from("report_attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("report_id", id)
    .single();
  if (!a) return fail("사진을 찾을 수 없습니다.");
  const removed = await supabase.storage
    .from("report-images")
    .remove([a.storage_path]);
  if (removed.error) return fail("사진 삭제 실패. 다시 시도해 주세요.");
  const { error } = await supabase
    .from("report_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("report_id", id);
  if (error) return fail("사진 기록 정리 실패. 다시 삭제를 시도해 주세요.");
  revalidatePath("/reports/" + id);
  return NextResponse.json({ ok: true });
}
