import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "./dates";
import type { ClassActor, ClassInput, ClassSession } from "./model";
import type { ClassFilters } from "./validation";

export const CLASS_PAGE_SIZE = 20;
export function classRepository(client: SupabaseClient, actor: ClassActor) {
  return {
    async list(filters: ClassFilters) {
      let query = client.from("class_sessions").select("*", { count: "exact" })
        .eq("organization_id", actor.organization_id)
        .gte("start_at", filters.from + "T00:00:00+09:00")
        .lt("start_at", addDays(filters.to, 1) + "T00:00:00+09:00")
        .order("start_at").order("id");
      if (filters.status !== "all") query = query.eq("status", filters.status);
      return query.range((filters.page - 1) * CLASS_PAGE_SIZE, filters.page * CLASS_PAGE_SIZE - 1).returns<ClassSession[]>();
    },
    async get(id: string) {
      return client.from("class_sessions").select("*")
        .eq("organization_id", actor.organization_id).eq("id", id).maybeSingle<ClassSession>();
    },
    async create(input: ClassInput) {
      return client.from("class_sessions").insert({
        ...input, organization_id: actor.organization_id, created_by: actor.id,
        updated_by: actor.id, status: "scheduled",
      }).select("*").single<ClassSession>();
    },
    async update(id: string, version: string, input: ClassInput) {
      return client.from("class_sessions").update({ ...input, updated_by: actor.id })
        .eq("organization_id", actor.organization_id).eq("id", id).eq("updated_at", version)
        .select("*").maybeSingle<ClassSession>();
    },
    async cancel(id: string) {
      return client.rpc("cancel_class_session", { p_session_id: id });
    },
  };
}
