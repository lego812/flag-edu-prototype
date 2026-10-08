import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, monthRange } from "./dates";
import type {
  ClassActor,
  ClassCalendarSession,
  ClassInput,
  ClassSession,
  Course,
  CourseInput,
} from "./model";
import type { ClassCalendarFilters, ClassFilters } from "./validation";

export const CLASS_PAGE_SIZE = 20;

async function syncCompletedSessions(
  client: SupabaseClient,
  organizationId: string,
) {
  await client.rpc("sync_completed_class_sessions", {
    p_organization_id: organizationId,
  });
}

export function classRepository(client: SupabaseClient, actor: ClassActor) {
  return {
    async list(filters: ClassFilters) {
      await syncCompletedSessions(client, actor.organization_id);
      let query = client.from("class_sessions").select("*", { count: "exact" })
        .eq("organization_id", actor.organization_id);
      if (filters.from)
        query = query.gte("start_at", filters.from + "T00:00:00+09:00");
      if (filters.to)
        query = query.lt(
          "start_at",
          addDays(filters.to, 1) + "T00:00:00+09:00",
        );
      query = query
        .order("start_at", { ascending: filters.sort === "oldest" })
        .order("id", { ascending: filters.sort === "oldest" });
      if (filters.status !== "all") query = query.eq("status", filters.status);
      return query.range((filters.page - 1) * CLASS_PAGE_SIZE, filters.page * CLASS_PAGE_SIZE - 1).returns<ClassSession[]>();
    },
    async calendar(filters: ClassCalendarFilters) {
      await syncCompletedSessions(client, actor.organization_id);
      const range = monthRange(filters.month);
      let query = client.from("class_sessions").select(
        "id,title,location,start_at,end_at,has_time,teaching_method,status,created_by",
        { count: "exact" },
      )
        .eq("organization_id", actor.organization_id)
        .gte("start_at", range.from + "T00:00:00+09:00")
        .lt("start_at", addDays(range.to, 1) + "T00:00:00+09:00")
        .order("start_at").order("id");
      if (filters.status !== "all") query = query.eq("status", filters.status);
      return query.range(0, 999).returns<ClassCalendarSession[]>();
    },
    async get(id: string) {
      await syncCompletedSessions(client, actor.organization_id);
      return client.from("class_sessions").select("*")
        .eq("organization_id", actor.organization_id).eq("id", id).maybeSingle<ClassSession>();
    },
    async create(input: ClassInput & { course_id: string }) {
      return client.from("class_sessions").insert({
        ...input, organization_id: actor.organization_id, created_by: actor.id,
        updated_by: actor.id, status: "scheduled",
      }).select("*").single<ClassSession>();
    },
    async update(
      id: string,
      version: string,
      input: ClassInput & { course_id?: string },
    ) {
      return client.from("class_sessions").update({ ...input, updated_by: actor.id })
        .eq("organization_id", actor.organization_id).eq("id", id).eq("updated_at", version)
        .select("*").maybeSingle<ClassSession>();
    },
    async cancel(id: string) {
      return client.rpc("cancel_class_session", { p_session_id: id });
    },
  };
}

export function courseRepository(client: SupabaseClient, actor: ClassActor) {
  return {
    async list(includeInactive = false) {
      let query = client
        .from("courses")
        .select("*", { count: "exact" })
        .eq("organization_id", actor.organization_id)
        .order("active", { ascending: false })
        .order("title")
        .order("created_at", { ascending: false });
      if (!includeInactive) query = query.eq("active", true);
      return query.returns<Course[]>();
    },
    async get(id: string) {
      return client
        .from("courses")
        .select("*")
        .eq("organization_id", actor.organization_id)
        .eq("id", id)
        .maybeSingle<Course>();
    },
    async create(input: CourseInput) {
      return client
        .from("courses")
        .insert({
          ...input,
          organization_id: actor.organization_id,
          created_by: actor.id,
          updated_by: actor.id,
        })
        .select("*")
        .single<Course>();
    },
    async update(id: string, version: string, input: CourseInput) {
      return client
        .from("courses")
        .update({ ...input, updated_by: actor.id })
        .eq("organization_id", actor.organization_id)
        .eq("id", id)
        .eq("updated_at", version)
        .select("*")
        .maybeSingle<Course>();
    },
  };
}
