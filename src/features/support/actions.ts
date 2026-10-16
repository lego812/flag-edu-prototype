"use server";
import { revalidatePath } from "next/cache";
import { masterAccount } from "@/features/master/access";
import { isUuid } from "@/features/classes/model";
import type { InquiryState } from "./model";
export async function saveInquiryAction(
  _state: InquiryState,
  form: FormData,
): Promise<InquiryState> {
  const { supabase, isMaster } = await masterAccount();
  if (isMaster) return { error: "master는 문의글 조회만 가능합니다." };
  const id = String(form.get("id") ?? "");
  const title = String(form.get("title") ?? "").trim();
  const body = String(form.get("body") ?? "").trim();
  const expected = String(form.get("version") ?? "");
  if (
    !isUuid(id) ||
    (expected &&
      !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(expected)) ||
    (expected && !Number.isFinite(Date.parse(expected)))
  )
    return { error: "문의글 정보를 확인하지 못했습니다. 새로고침해 주세요." };
  if (
    !title ||
    Array.from(title).length > 100 ||
    !body ||
    Array.from(body).length > 5000
  )
    return { error: "제목은 1~100자, 내용은 1~5,000자로 입력해 주세요." };
  const { data, error } = await supabase.rpc("save_support_inquiry", {
    p_id: id,
    p_title: title,
    p_body: body,
    p_expected_updated_at: expected || null,
  });
  if (error || data !== id)
    return {
      error:
        error?.code === "40001"
          ? "이미 저장되었거나 다른 화면에서 수정된 문의글입니다. 입력 내용을 복사한 뒤 새로고침해 확인해 주세요."
          : error?.code === "42501"
            ? "본인이 작성한 문의글만 편집할 수 있습니다."
            : "저장하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
    };
  revalidatePath("/manage/support");
  revalidatePath(`/manage/support/${id}`);
  revalidatePath(`/manage/support/${id}/edit`);
  return { savedId: id };
}
