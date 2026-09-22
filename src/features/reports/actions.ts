"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { getReport, getTemplate } from "./repository";
import { parseAnswers } from "./validation";
import type { ActionState } from "./model";
import { isUuid } from "@/features/classes/model";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function startReportAction(
  sessionId: string,
  _state: ActionState,
): Promise<ActionState> {
  void _state;
  const { supabase } = await requireCurrentProfile();
  if (!isUuid(sessionId)) return { error: "수업을 확인해 주세요." };
  const { data, error } = await supabase.rpc("get_or_create_report", {
    p_class_session_id: sessionId,
  });
  if (error || !data)
    return {
      error:
        "보고서를 열지 못했습니다. 수업이 취소됐거나 게시된 템플릿이 없을 수 있습니다.",
    };
  revalidatePath("/reports");
  redirect("/reports/" + data.id + "?edit=1");
}
export async function saveReportAction(
  id: string,
  _state: ActionState,
  form: FormData,
): Promise<ActionState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (!isUuid(id)) return { error: "잘못된 보고서입니다." };
  const { data: report } = await getReport(supabase, id);
  if (!report || report.author_id !== profile.id)
    return { error: "본인의 보고서만 수정할 수 있습니다." };
  let answers;
  try {
    const template = await getTemplate(supabase, report.template_version_id);
    const counts: Record<string, number> = {};
    report.report_attachments.forEach(
      (a) => (counts[a.field_id] = (counts[a.field_id] ?? 0) + 1),
    );
    answers = parseAnswers(
      template.template_fields,
      form,
      form.get("intent") === "submit",
      counts,
    );
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "입력값을 확인해 주세요.",
    };
  }
  const { error } = await supabase.rpc("save_and_submit_report", {
    p_id: id,
    p_version: form.get("version"),
    p_answers: answers,
    p_submit: form.get("intent") === "submit",
  });
  if (error)
    return {
      error:
        error.code === "40001"
          ? "다른 화면에서 보고서가 변경됐습니다. 입력 내용을 복사한 뒤 새로고침해 주세요."
          : "저장하지 못했습니다. 취소 여부와 필수 항목, DB 설정을 확인해 주세요.",
    };
  revalidatePath("/reports");
  revalidatePath("/reports/" + id);
  revalidatePath("/admin-reports");
  revalidatePath("/dashboard");
  return {
    redirectTo: form.get("intent") === "submit" ? "/reports" : undefined,
    success:
      form.get("intent") === "submit" ? "제출했습니다." : "저장했습니다.",
  };
}
