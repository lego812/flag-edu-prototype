import type { SupabaseClient } from "@supabase/supabase-js";

export async function recordMaintenanceFailure(
  client: SupabaseClient,
  runId: string,
  stage: string,
  workspaceId: string | null,
  error: unknown,
) {
  const value =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "UNEXPECTED_ERROR";
  const errorCode = /^[A-Z0-9_]{1,40}$/.test(value)
    ? value
    : "UNEXPECTED_ERROR";
  // Do not record backend messages, file paths, report content, emails or tokens.
  console.error("maintenance_failure", {
    runId,
    stage,
    workspaceId,
    errorCode,
  });
  try {
    const saved = await client.rpc("record_maintenance_failure", {
      p_run_id: runId,
      p_stage: stage,
      p_workspace_id: workspaceId,
      p_error_code: errorCode,
    });
    if (saved.error) throw new Error("Log write failed");
    return true;
  } catch {
    console.error("maintenance_log_write_failed", { runId, stage });
    return false;
  }
}

export function maintenanceError(code: string) {
  return Object.assign(new Error(code), { code });
}
