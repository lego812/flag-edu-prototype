"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { classRepository } from "./repository";
import { canManageClass, isUuid } from "./model";
import { parseClassForm, type ClassFormState } from "./validation";
import { buildSchedule, type RepeatUnit } from "./recurrence";

export async function createScheduleAction(
  _state: ClassFormState,
  form: FormData,
): Promise<ClassFormState> {
  const { supabase } = await requireCurrentProfile();
  const parsed = parseClassForm(form);
  if ("state" in parsed) return parsed.state;
  const registrationId = String(form.get("registration_id") ?? "");
  if (!isUuid(registrationId))
    return { error: "등록 화면을 새로고침해 주세요." };
  let items;
  try {
    items = buildSchedule(
      parsed.input,
      String(form.get("repeat") ?? "none") as RepeatUnit,
      Number(form.get("every")),
      String(form.get("until") ?? ""),
      form.getAll("weekday").map(Number),
      form.get("month_day") ? Number(form.get("month_day")) : undefined,
    );
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "반복 설정을 확인해 주세요.",
    };
  }
  let id: string;
  try {
    const { data, error } = await supabase.rpc("create_class_schedule", {
      p_registration_id: registrationId,
      p_items: items,
    });
    if (error || !data)
      return {
        error:
          "수업을 등록하지 못했습니다. DB 설정과 네트워크를 확인한 뒤 다시 시도해 주세요.",
      };
    id = data;
  } catch {
    return {
      error:
        "서버에 연결하지 못했습니다. 입력 내용을 유지했으니 다시 시도해 주세요.",
    };
  }
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  redirect("/classes/" + id);
}

export async function createClassAction(
  _state: ClassFormState,
  form: FormData,
): Promise<ClassFormState> {
  const { supabase, profile } = await requireCurrentProfile();
  const parsed = parseClassForm(form);
  if ("state" in parsed) return parsed.state;
  let id: string;
  try {
    const { data, error } = await classRepository(supabase, profile).create(
      parsed.input,
    );
    if (error || !data)
      return {
        error:
          "수업을 등록하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.",
        values: parsed.values,
      };
    id = data.id;
  } catch {
    return {
      error: "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
      values: parsed.values,
    };
  }
  revalidatePath("/classes");
  revalidatePath("/dashboard");
  redirect("/classes/" + id);
}

export async function updateClassAction(
  id: string,
  _state: ClassFormState,
  form: FormData,
): Promise<ClassFormState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (!isUuid(id)) return { error: "수업을 찾을 수 없습니다." };
  const parsed = parseClassForm(form);
  if ("state" in parsed) return parsed.state;
  const version = form.get("version");
  try {
    const repository = classRepository(supabase, profile);
    const { data: current, error } = await repository.get(id);
    if (error || !current || !canManageClass(profile, current))
      return {
        error: "수업을 수정할 권한이 없거나 수업을 찾을 수 없습니다.",
        values: parsed.values,
      };
    if (typeof version !== "string" || version !== current.updated_at)
      return {
        error:
          "다른 사용자가 수업을 변경했습니다. 새로고침 후 다시 수정해 주세요.",
        values: parsed.values,
      };
    const result = await repository.update(id, version, parsed.input);
    if (result.error)
      return {
        error: "수업을 수정하지 못했습니다. 다시 시도해 주세요.",
        values: parsed.values,
      };
    if (!result.data)
      return {
        error:
          "수업 정보가 변경됐거나 권한이 없습니다. 새로고침 후 확인해 주세요.",
        values: parsed.values,
      };
  } catch {
    return {
      error: "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
      values: parsed.values,
    };
  }
  revalidatePath("/classes");
  revalidatePath("/classes/" + id);
  redirect("/classes/" + id);
}

export async function cancelClassAction(
  id: string,
  _state: ClassFormState,
  form: FormData,
): Promise<ClassFormState> {
  const { supabase, profile } = await requireCurrentProfile();
  if (!isUuid(id) || form.get("confirm") !== "yes")
    return { error: "수업 취소 확인을 선택해 주세요." };
  try {
    const repository = classRepository(supabase, profile);
    const { data: current, error } = await repository.get(id);
    if (error || !current || !canManageClass(profile, current))
      return { error: "수업을 취소할 권한이 없거나 수업을 찾을 수 없습니다." };
    if (current.status !== "cancelled") {
      const result = await repository.cancel(id);
      if (result.error)
        return { error: "수업을 취소하지 못했습니다. 다시 시도해 주세요." };
    }
  } catch {
    return {
      error: "서버에 연결하지 못했습니다. 네트워크 상태를 확인해 주세요.",
    };
  }
  revalidatePath("/classes");
  revalidatePath("/classes/" + id);
  redirect("/classes/" + id);
}
