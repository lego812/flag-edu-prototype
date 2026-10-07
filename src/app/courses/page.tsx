import Link from "next/link";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { courseRepository } from "@/features/classes/repository";

export const metadata = { title: "수업 관리" };

export default async function CoursesPage() {
  const { supabase, profile } = await requireCurrentProfile();
  const { data, error } = await courseRepository(supabase, profile).list();
  if (error) throw new Error("수업 조회 실패");
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">수업</h1>
          <p className="mt-2 text-neutral-600">
            반복해서 사용할 수업 기본정보를 관리합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/classes" className="btn-secondary">일정 조회</Link>
          <Link href="/courses/new" className="btn">수업 등록</Link>
        </div>
      </header>
      {data?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.map((course) => (
            <li key={course.id}>
              <Link
                href={`/courses/${course.id}`}
                className="surface block min-h-36 border border-neutral-200 p-5 transition hover:border-neutral-400"
              >
                <h2 className="break-words text-lg font-bold">{course.title}</h2>
                <p className="mt-2 break-words text-sm text-neutral-600">{course.location}</p>
                {course.created_by === profile.id && (
                  <p className="mt-4 text-xs font-semibold">내가 등록한 수업</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-neutral-600">
          등록된 수업이 없습니다.
        </p>
      )}
    </div>
  );
}
