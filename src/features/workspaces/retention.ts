import type { SupabaseClient } from "@supabase/supabase-js";
import {
  maintenanceError,
  recordMaintenanceFailure,
} from "@/lib/maintenance-log";

export async function purgeExpiredWorkspaces(
  client: SupabaseClient,
  runId = crypto.randomUUID(),
) {
  const deadline = Date.now() + 35_000;
  const { data: workspaces, error } = await client.rpc(
    "list_workspaces_due_for_purge",
  );
  if (error) {
    await recordMaintenanceFailure(
      client,
      runId,
      "retention_list",
      null,
      error,
    );
    throw maintenanceError("RETENTION_LIST_FAILED");
  }
  let purged = 0;
  let filesRemoved = 0;
  let failed = 0;
  let deferred = 0;
  for (const workspace of workspaces ?? []) {
    if (Date.now() >= deadline) {
      deferred++;
      continue;
    }
    const args = { p_workspace_id: workspace.id };
    let stage = "retention_begin";
    let finishedWorkspace = false;
    try {
      const started = await client.rpc("begin_workspace_purge", args);
      if (started.error) throw started.error;
      if (started.data !== true) continue;
      batchLoop: for (
        let batch = 0;
        batch < 20 && Date.now() < deadline;
        batch++
      ) {
        stage = "retention_files_list";
        const objects = await client.rpc("list_workspace_purge_objects", args);
        if (objects.error) throw objects.error;
        if (!objects.data?.length) {
          if (Date.now() >= deadline) break;
          stage = "retention_finish";
          const finished = await client.rpc("finish_workspace_purge", args);
          if (finished.error) throw finished.error;
          if (finished.data === true) purged++;
          finishedWorkspace = true;
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
            throw maintenanceError("RETENTION_FILE_SCOPE_MISMATCH");
          }
          groups.set(object.bucket_id, [
            ...(groups.get(object.bucket_id) ?? []),
            object.name,
          ]);
        }
        for (const [bucket, paths] of groups) {
          if (Date.now() >= deadline) break batchLoop;
          stage = "retention_files_remove";
          const removed = await client.storage.from(bucket).remove(paths);
          if (removed.error) throw removed.error;
          filesRemoved += paths.length;
        }
      }
      if (!finishedWorkspace) deferred++;
    } catch (error) {
      // Keep the tombstone and rows; the next invocation resumes file removal.
      failed++;
      await recordMaintenanceFailure(client, runId, stage, workspace.id, error);
    }
  }
  return { purged, filesRemoved, failed, deferred };
}
