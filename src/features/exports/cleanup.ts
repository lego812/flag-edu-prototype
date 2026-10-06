import type { SupabaseClient } from "@supabase/supabase-js";

export async function cleanupExpiredExports(
  client: SupabaseClient,
  now = new Date().toISOString(),
) {
  const { data, error } = await client
    .from("export_jobs")
    .select("id,storage_path")
    .not("storage_path", "is", null)
    .lte("expires_at", now)
    .limit(500);
  if (error) throw new Error("만료된 내보내기 조회 실패");

  const jobs = (data ?? []).filter(
    (job): job is { id: string; storage_path: string } =>
      typeof job.id === "string" && typeof job.storage_path === "string",
  );
  if (!jobs.length) return 0;

  const removed = await client.storage
    .from("report-exports")
    .remove(jobs.map((job) => job.storage_path));
  if (removed.error) throw new Error("만료된 내보내기 파일 삭제 실패");

  const cleared = await client
    .from("export_jobs")
    .update({ storage_path: null })
    .in(
      "id",
      jobs.map((job) => job.id),
    );
  if (cleared.error) throw new Error("만료된 내보내기 이력 정리 실패");
  return jobs.length;
}
