import type { ClassSession, Course } from "./model";
import { ClassWizard } from "./class-wizard";
export function ClassForm({
  session,
  courses,
  initialCourseId,
}: {
  session?: ClassSession;
  courses: Course[];
  initialCourseId?: string;
}) {
  return (
    <ClassWizard
      session={session}
      courses={courses}
      initialCourseId={initialCourseId}
    />
  );
}
