export type ClassSession = {
  id: string;
  organization_id: string;
  title: string;
  location: string;
  start_at: string;
  end_at: string;
  memo: string | null;
  status: "scheduled" | "cancelled";
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

export type ClassInput = Pick<ClassSession, "title" | "location" | "start_at" | "end_at" | "memo">;
export type ClassActor = { id: string; organization_id: string; role: string; status: string };
export const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function canManageClass(actor: ClassActor, session: ClassSession) {
  return actor.status === "active" &&
    actor.organization_id === session.organization_id &&
    (actor.role === "admin" || actor.id === session.created_by);
}
