import { cleanupExpiredExports } from "@/features/exports/cleanup";
import { createAdminClient } from "@/lib/supabase/admin";
import { purgeExpiredWorkspaces } from "@/features/workspaces/retention";
import { recordMaintenanceFailure } from "@/lib/maintenance-log";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const client = createAdminClient(5_000);
    if (new URL(request.url).searchParams.get("dryRun") === "true") {
      const due = await client.rpc("list_workspaces_due_for_purge");
      if (due.error) throw due.error;
      return Response.json({
        dryRun: true,
        dueWorkspacesInBatch: due.data?.length ?? 0,
      });
    }
    const runId = crypto.randomUUID();
    let removed = 0,
      completed = 0,
      taskFailures = 0;
    // Each task proceeds independently. A failure in one cannot skip retention.
    await Promise.all([
      (async () => {
        try {
          removed = await cleanupExpiredExports(client);
        } catch (error) {
          taskFailures++;
          await recordMaintenanceFailure(
            client,
            runId,
            "exports_cleanup",
            null,
            error,
          );
        }
      })(),
      (async () => {
        try {
          const result = await client.rpc("sync_completed_class_sessions", {
            p_organization_id: null,
          });
          if (result.error) throw result.error;
          completed = result.data ?? 0;
        } catch (error) {
          taskFailures++;
          await recordMaintenanceFailure(
            client,
            runId,
            "sessions_sync",
            null,
            error,
          );
        }
      })(),
    ]);
    let retention = { purged: 0, filesRemoved: 0, failed: 0, deferred: 0 };
    try {
      retention = await purgeExpiredWorkspaces(client, runId);
    } catch (error) {
      taskFailures++;
      await recordMaintenanceFailure(
        client,
        runId,
        "retention_task",
        null,
        error,
      );
    }
    return Response.json(
      { runId, removed, completed, retention, taskFailures },
      { status: retention.failed || taskFailures ? 500 : 200 },
    );
  } catch {
    console.error("maintenance_bootstrap_failed", {
      errorCode: "MAINTENANCE_BOOTSTRAP_FAILED",
    });
    return Response.json(
      { error: "만료된 내보내기 정리에 실패했습니다." },
      { status: 500 },
    );
  }
}
