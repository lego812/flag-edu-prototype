import { CourseForm } from "@/features/classes/course-form";

export const metadata = { title: "수업 등록" };

export default function NewCoursePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">수업 등록</h1>
      <p className="text-neutral-600">
        수업 기본정보를 한 번 등록하면 일정 등록에서 반복해서 선택할 수 있습니다.
      </p>
      <CourseForm />
    </div>
  );
}
