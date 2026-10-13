import type { SupabaseClient } from "@supabase/supabase-js";

export async function purgeExpiredWorkspaces(client: SupabaseClient) {
  const deadline = Date.now() + 35_000;
  const { data: workspaces, error } = await client.rpc(
    "list_workspaces_due_for_purge",
  );
  if (error) throw new Error("워크스페이스 보관 만료 조회 실패");
  let purged = 0;
  let filesRemoved = 0;
  let failed = 0;
  for (const workspace of workspaces ?? []) {
    if (Date.now() >= deadline) break;
    const args = { p_workspace_id: workspace.id };
    try {
      const started = await client.rpc("begin_workspace_purge", args);
      if (started.error) throw new Error("보관 만료 확인 실패");
      if (started.data !== true) continue;
      for (let batch = 0; batch < 20 && Date.now() < deadline; batch++) {
        const objects = await client.rpc("list_workspace_purge_objects", args);
        if (objects.error) throw new Error("만료 파일 조회 실패");
        if (!objects.data?.length) {
          const finished = await client.rpc("finish_workspace_purge", args);
          if (finished.error) throw new Error("만료 기록 정리 실패");
          if (finished.data === true) purged++;
          break;
        }
        const groups = new Map<string, string[]>();
        for (const object of objects.data as {
          bucket_id: string;
          name: string;
        }[]) {
          if (
            !["report-images", "report-exports"].includes(object.bucket_id) ||
            !object.name.startsWith(`${workspace.id}/`)
          ) {
            throw new Error("만료 파일 범위 불일치");
          }
          groups.set(object.bucket_id, [
            ...(groups.get(object.bucket_id) ?? []),
            object.name,
          ]);
        }
        for (const [bucket, paths] of groups) {
          const removed = await client.storage.from(bucket).remove(paths);
          if (removed.error) throw new Error("만료 파일 삭제 실패");
          filesRemoved += paths.length;
        }
      }
    } catch {
      // Keep the tombstone and rows; the next invocation resumes file removal.
      failed++;
    }
  }
  return { purged, filesRemoved, failed };
}
