import Link from "next/link";
import { ClassForm } from "@/features/classes/class-form";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { courseRepository } from "@/features/classes/repository";
export const metadata = { title: "수업 일정 등록" };
export default async function NewClassPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string }>;
}) {
  const { supabase, profile } = await requireCurrentProfile();
  const { course } = await searchParams;
  const { data: courses, error } = await courseRepository(supabase, profile).list();
  if (error) throw new Error("수업 목록 조회 실패");
  return <div className="mx-auto max-w-2xl"><h1 className="mb-6 text-3xl font-bold">수업 일정 등록</h1>
    {!courses?.length ? (
      <section className="surface space-y-4 p-6">
        <p>일정을 만들려면 수업 기본정보를 먼저 등록해 주세요.</p>
        <Link href="/courses/new" className="btn">수업 등록</Link>
      </section>
    ) : (
      <section className="max-w-2xl border-t border-neutral-200 py-6"><ClassForm courses={courses} initialCourseId={course} /></section>
    )}
  </div>;
}
