"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { classRepository, courseRepository } from "./repository";
import { canManageClass, canManageCourse, isUuid } from "./model";
import {
  parseClassForm,
  parseCourseForm,
  type ClassFormState,
  type CourseFormState,
} from "./validation";
import { buildSchedule, type RepeatUnit } from "./recurrence";

export async function createScheduleAction(
  _state: ClassFormState,
  form: FormData,
): Promise<ClassFormState> {
  const { supabase, profile } = await requireCurrentProfile();
  const parsed = parseClassForm(form);
  if ("state" in parsed) return parsed.state;
  const courseId = String(form.get("course_id") ?? "");
  if (!isUuid(courseId)) return { error: "등록할 수업을 선택해 주세요." };
  const { data: course, error: courseError } = await courseRepository(
    supabase,
    profile,
  ).get(courseId);
  if (courseError || !course?.active)
    return { error: "사용 가능한 수업을 찾지 못했습니다." };
  parsed.input.title = course.title;
  parsed.input.location = course.location;
  parsed.input.teaching_method = course.teaching_method;
  parsed.input.memo = course.memo;
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
      p_course_id: courseId,
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
  const courseId = String(form.get("course_id") ?? "");
  if (!isUuid(courseId)) return { error: "수업을 선택해 주세요." };
  const { data: course, error: courseError } = await courseRepository(
    supabase,
    profile,
  ).get(courseId);
  if (courseError || !course?.active)
    return { error: "사용 가능한 수업을 찾지 못했습니다." };
  let id: string;
  try {
    const { data, error } = await classRepository(supabase, profile).create(
      {
        ...parsed.input,
        course_id: course.id,
        title: course.title,
        location: course.location,
        teaching_method: course.teaching_method,
        memo: course.memo,
      },
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
  const courseId = String(form.get("course_id") ?? "");
  if (!isUuid(courseId)) return { error: "수업을 선택해 주세요." };
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
    const { data: course, error: courseError } = await courseRepository(
      supabase,
      profile,
    ).get(courseId);
    if (courseError || !course)
      return { error: "수업 기본정보를 찾을 수 없습니다.", values: parsed.values };
    const result = await repository.update(id, version, {
      ...parsed.input,
      course_id: course.id,
      title: course.title,
      location: course.location,
      teaching_method: course.teaching_method,
      memo: course.memo,
    });
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

export async function createCourseAction(
  _state: CourseFormState,
  form: FormData,
): Promise<CourseFormState> {
  const { supabase, profile } = await requireCurrentProfile();
  const parsed = parseCourseForm(form);
  if ("state" in parsed) return parsed.state;
  const { data, error } = await courseRepository(supabase, profile).create(
    parsed.input,
  );
  if (error || !data)
    return { error: "수업을 등록하지 못했습니다.", values: parsed.input };
  revalidatePath("/courses");
  revalidatePath("/classes/new");
  redirect("/courses/" + data.id);
}

export async function updateCourseAction(
  id: string,
  _state: CourseFormState,
  form: FormData,
): Promise<CourseFormState> {
  if (!isUuid(id)) return { error: "수업을 찾을 수 없습니다." };
  const { supabase, profile } = await requireCurrentProfile();
  const parsed = parseCourseForm(form);
  if ("state" in parsed) return parsed.state;
  const repository = courseRepository(supabase, profile);
  const { data: current, error } = await repository.get(id);
  if (error || !current || !canManageCourse(profile, current))
    return { error: "수업을 수정할 권한이 없습니다.", values: parsed.input };
  const version = String(form.get("version") ?? "");
  if (version !== current.updated_at)
    return { error: "다른 사용자가 수업을 변경했습니다. 새로고침해 주세요.", values: parsed.input };
  const result = await repository.update(id, version, parsed.input);
  if (result.error || !result.data)
    return { error: "수업을 수정하지 못했습니다.", values: parsed.input };
  revalidatePath("/courses");
  revalidatePath("/courses/" + id);
  revalidatePath("/classes/new");
  redirect("/courses/" + id);
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
