"use client";
import { SubmitButton } from "@/components/submit-button";

import { useActionState } from "react";
import { createCourseAction, updateCourseAction } from "./actions";
import type { Course } from "./model";
import type { CourseFormState } from "./validation";

export function CourseForm({ course }: { course?: Course }) {
  const [state, action, pending] = useActionState<CourseFormState, FormData>(
    course ? updateCourseAction.bind(null, course.id) : createCourseAction,
    {},
  );
  const value = <K extends keyof NonNullable<CourseFormState["values"]>>(
    key: K,
    fallback: string | null,
  ) => state.values?.[key] ?? fallback ?? "";
  return (
    <form action={action} className="space-y-6">
      {course && <input type="hidden" name="version" value={course.updated_at} />}
      <fieldset disabled={pending} className="space-y-5">
        <label className="block text-sm font-semibold">
          수업명
          <input
            className="input mt-2"
            name="title"
            required
            maxLength={150}
            defaultValue={value("title", course?.title ?? "")}
            placeholder="예: 초등 체육 수업"
          />
        </label>
        <label className="block text-sm font-semibold">
          장소 또는 기관명
          <input
            className="input mt-2"
            name="location"
            required
            maxLength={200}
            defaultValue={value("location", course?.location ?? "")}
            placeholder="예: 행복 돌봄센터"
          />
        </label>
        <label className="block text-sm font-semibold">
          수업 진행방식 (선택)
          <textarea
            className="input mt-2"
            name="teaching_method"
            rows={4}
            maxLength={2000}
            defaultValue={value(
              "teaching_method",
              course?.teaching_method ?? "",
            )}
            placeholder="예: 준비 운동 → 팀 활동 → 마무리"
          />
        </label>
        <label className="block text-sm font-semibold">
          메모 (선택)
          <textarea
            className="input mt-2"
            name="memo"
            rows={4}
            maxLength={5000}
            defaultValue={value("memo", course?.memo ?? "")}
            placeholder="준비물이나 운영 참고사항을 남겨 주세요."
          />
        </label>
        <SubmitButton pendingLabel="저장 중…" className="btn" pending={pending}>
          {course ? "수업 수정" : "수업 등록"}
        </SubmitButton>
      </fieldset>
      {state.error && <p role="alert" className="text-red-700">{state.error}</p>}
    </form>
  );
}
