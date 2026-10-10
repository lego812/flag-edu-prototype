import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { canManageCourse, isUuid } from "@/features/classes/model";
import { courseRepository } from "@/features/classes/repository";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile } = await requireCurrentProfile();
  const { data: course, error } = await courseRepository(supabase, profile).get(id);
  if (error) throw new Error("수업 조회 실패");
  if (!course || !course.active) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/courses" className="text-sm underline">수업 목록</Link>
      <section className="surface p-6 sm:p-8">
        <h1 className="break-words text-3xl font-bold">{course.title}</h1>
        <dl className="mt-6 space-y-5">
          <div><dt className="text-sm text-neutral-500">장소 또는 기관명</dt><dd className="mt-1 break-words">{course.location}</dd></div>
          <div><dt className="text-sm text-neutral-500">수업 진행방식</dt><dd className="mt-1 whitespace-pre-wrap break-words">{course.teaching_method || "등록된 내용이 없습니다."}</dd></div>
          <div><dt className="text-sm text-neutral-500">메모</dt><dd className="mt-1 whitespace-pre-wrap break-words">{course.memo || "등록된 메모가 없습니다."}</dd></div>
        </dl>
        <div className="mt-8 flex flex-wrap gap-2">
          {canManageCourse(profile, course) && (
            <Link href={`/courses/${id}/edit`} className="btn">수업 수정</Link>
          )}
          <Link href={`/classes/new?course=${id}`} className="btn-secondary">이 수업 일정 등록</Link>
        </div>
      </section>
    </div>
  );
}
