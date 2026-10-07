export type ClassSession = {
  id: string;
  organization_id: string;
  course_id: string;
  title: string;
  location: string;
  start_at: string;
  end_at: string;
  has_time?: boolean;
  memo: string | null;
  teaching_method?: string | null;
  status: "scheduled" | "cancelled" | "completed";
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  organization_id: string;
  title: string;
  location: string;
  teaching_method: string | null;
  memo: string | null;
  active: boolean;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type CourseInput = Pick<
  Course,
  "title" | "location" | "teaching_method" | "memo"
>;

export type ClassInput = Pick<
  ClassSession,
  | "title"
  | "location"
  | "start_at"
  | "end_at"
  | "memo"
  | "has_time"
  | "teaching_method"
>;
export type ClassCalendarSession = Pick<
  ClassSession,
  | "id"
  | "title"
  | "location"
  | "start_at"
  | "end_at"
  | "has_time"
  | "status"
  | "created_by"
>;
export type ClassActor = {
  id: string;
  organization_id: string;
  role: string;
  status: string;
};
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function canManageClass(actor: ClassActor, session: ClassSession) {
  return (
    actor.status === "active" &&
    actor.organization_id === session.organization_id &&
    (actor.role === "admin" || actor.id === session.created_by)
  );
}

export function canManageCourse(actor: ClassActor, course: Course) {
  return (
    actor.status === "active" &&
    actor.organization_id === course.organization_id &&
    (actor.role === "admin" || actor.id === course.created_by)
  );
}
