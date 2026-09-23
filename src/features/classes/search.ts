"use server";
import { requireCurrentProfile } from "@/features/auth/current-user";
export async function searchClasses(term: string) {
  const { supabase, profile } = await requireCurrentProfile();
  const query = term.trim().slice(0, 150);
  if (!query) return { data: [] };
  const { data, error } = await supabase
    .from("class_sessions")
    .select("id,title,start_at,has_time")
    .eq("organization_id", profile.organization_id)
    .ilike("title", `%${query.replace(/[\\%_]/g, "\\$&")}%`)
    .order("start_at", { ascending: false })
    .limit(30);
  return error
    ? { data: [], error: "수업을 검색하지 못했습니다." }
    : { data: data ?? [] };
}
