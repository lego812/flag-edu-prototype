import { notFound, redirect } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { CourseForm } from "@/features/classes/course-form";
import { canManageCourse, isUuid } from "@/features/classes/model";
import { courseRepository } from "@/features/classes/repository";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireCurrentProfile();
  const { data: course, error } = await courseRepository(supabase, profile).get(id);
  if (error) throw new Error("수업 조회 실패");
  if (!course || !course.active) notFound();
  if (!canManageCourse(profile, course)) redirect(`/courses/${id}`);
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">수업 수정</h1>
      <p className="text-sm text-neutral-600">
        변경 내용은 앞으로 등록할 일정에 적용됩니다. 이미 등록된 일정의 기록은 유지됩니다.
      </p>
      <CourseForm course={course} />
    </div>
  );
}
