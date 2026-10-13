// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordMaintenanceFailure } from "./maintenance-log";
afterEach(() => vi.restoreAllMocks());
it("records only safe metadata without credentials, paths or content", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const rpc = vi.fn().mockResolvedValue({ error: null });
  await recordMaintenanceFailure(
    { rpc } as unknown as SupabaseClient,
    "run",
    "retention_files_remove",
    "workspace",
    { code: "42501", message: "token private-photo.jpg report-content" },
  );
  expect(rpc).toHaveBeenCalledWith("record_maintenance_failure", {
    p_run_id: "run",
    p_stage: "retention_files_remove",
    p_workspace_id: "workspace",
    p_error_code: "42501",
  });
  expect(JSON.stringify([...rpc.mock.calls, ...log.mock.calls])).not.toContain(
    "private-photo",
  );
});
it("logs a safe fallback when durable logging fails", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const rpc = vi.fn().mockRejectedValue(new Error("secret"));
  expect(
    await recordMaintenanceFailure(
      { rpc } as unknown as SupabaseClient,
      "run",
      "sessions_sync",
      null,
      { code: "email@example.test" },
    ),
  ).toBe(false);
  expect(log).toHaveBeenCalledWith("maintenance_log_write_failed", {
    runId: "run",
    stage: "sessions_sync",
  });
  expect(JSON.stringify(log.mock.calls)).not.toContain("secret");
});
