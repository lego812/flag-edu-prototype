import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
import { PHOTO_BATCH_MAX_BYTES, PHOTO_BATCH_SIZE, PHOTO_MAX_BYTES } from "@/features/reports/photo-batch";
import type { Attachment } from "@/features/reports/model";

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requireCurrentProfile();
  const { id } = await params;
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return fail("잘못된 요청입니다.", 403);
  if (!isUuid(id)) return fail("보고서를 찾을 수 없습니다.");
  if (Number(request.headers.get("content-length")) > PHOTO_BATCH_MAX_BYTES)
    return fail("사진 크기가 너무 큽니다.", 413);
  let form: FormData;
  try { form = await request.formData(); }
  catch { return fail("사진 요청을 읽지 못했습니다."); }
  const files = form.getAll("file");
  const field = form.get("field");
  const seenVersion = form.get("version");
  if (typeof field !== "string" || !isUuid(field) ||
      typeof seenVersion !== "string" || !Number.isFinite(Date.parse(seenVersion)) ||
      files.length < 1 || files.length > PHOTO_BATCH_SIZE)
    return fail("사진 요청을 확인해 주세요.");
  const photos: { bytes: Uint8Array; path: string; index: number }[] = [];
  for (const [index, file] of files.entries()) {
    if (!(file instanceof File) || file.type !== "image/jpeg" || file.size < 1 || file.size > PHOTO_MAX_BYTES)
      return fail("1MiB 이하 JPG 사진만 허용합니다.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
      return fail("JPG 형식을 확인해 주세요.");
    photos.push({ bytes, path: `${profile.organization_id}/${id}/${crypto.randomUUID()}.jpg`, index });
  }
  let query = supabase.from("reports")
    .select("id,template_version_id,class_sessions!inner(status)").eq("id", id);
  if (profile.role !== "admin") query = query.eq("author_id", profile.id);
  const { data: report } = await query.single();
  if (!report) return fail("보고서를 변경할 권한이 없습니다.", 403);
  const session = Array.isArray(report.class_sessions) ? report.class_sessions[0] : report.class_sessions;
  if (session?.status === "cancelled") return fail("취소된 수업의 보고서는 변경할 수 없습니다.", 409);
  const { data: target } = await supabase.from("template_fields").select("id")
    .eq("id", field).eq("template_version_id", report.template_version_id).eq("field_type", "photo").single();
  if (!target) return fail("사진 항목이 아닙니다.");

  const storage = supabase.storage.from("report-images");
  // Only file transfer is concurrent. The existing RPC keeps authorization,
  // cancellation, attachment limits and revision checks at each DB write.
  const uploads = await Promise.allSettled(photos.map(photo =>
    storage.upload(photo.path, photo.bytes, { contentType: "image/jpeg", upsert: false })));
  const committed: (Attachment & { clientIndex: number })[] = [];
  const retained = new Set<string>();
  let version = seenVersion;
  let error = "";
  let status = 400;
  for (const [index, upload] of uploads.entries()) {
    if (upload.status === "rejected" || upload.value.error) {
      error = "일부 사진 업로드에 실패했습니다.";
      continue;
    }
    const photo = photos[index];
    const { data: changed, error: changeError } = await supabase.rpc("mutate_report_photo", {
      p_report_id: id, p_version: version, p_operation: "insert",
      p_attachment: { field_id: field, storage_path: photo.path, file_size: photo.bytes.length },
    });
    if (changeError || !changed) {
      status = changeError?.code === "PT409" ? 409 : 400;
      error = status === 409 ? "다른 화면에서 보고서가 변경됐습니다. 새로고침 후 다시 시도해 주세요."
        : "사진을 등록하지 못했습니다. 최대 첨부 수를 확인해 주세요.";
      // A lost RPC response may already have committed. Never delete that file
      // unless PostgreSQL explicitly rejected the transaction. Do not auto-retry.
      if (!changeError?.code || !/^[A-Z0-9]{5}$/.test(changeError.code)) {
        retained.add(photo.path);
        error = "저장 결과를 확인하지 못했습니다. 새로고침 후 사진을 확인해 주세요.";
        console.error("photo_batch_commit_uncertain", { reportId: id });
      }
      break;
    }
    retained.add(photo.path);
    committed.push({ ...changed.attachment, clientIndex: photo.index });
    version = changed.version;
  }
  const unused = photos.filter(photo => !retained.has(photo.path)).map(photo => photo.path);
  if (unused.length) {
    try {
      const cleanup = await storage.remove(unused);
      if (cleanup.error) throw new Error("cleanup");
    } catch {
      console.error("photo_batch_cleanup_failed", { reportId: id, count: unused.length });
      error += " 사진 파일 정리에 실패했습니다. 관리자에게 문의해 주세요.";
    }
  }
  if (!committed.length) return fail(error || "사진 업로드에 실패했습니다.", status);
  // Signing is display-only: a signing failure must not hide successful writes.
  let urls: { path: string | null; signedUrl: string | null }[] = [];
  try {
    const signed = await storage.createSignedUrls(committed.map(photo => photo.storage_path), 600);
    urls = signed.data ?? [];
  } catch { /* Saved photos remain available after a reload. */ }
  revalidatePath("/reports/" + id);
  return NextResponse.json({
    attachments: committed.map(photo => ({ ...photo, url: urls.find(url => url.path === photo.storage_path)?.signedUrl })),
    version, ...(error ? { error } : {}),
  });
}
