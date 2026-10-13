// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
  retention: vi.fn(),
}));
vi.mock("@/features/workspaces/retention", () => ({
  purgeExpiredWorkspaces: mocks.retention,
}));

vi.mock("@/features/exports/cleanup", () => ({
  cleanupExpiredExports: mocks.cleanup,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.admin,
}));

describe("expired export cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    mocks.admin.mockReturnValue({ rpc: mocks.rpc });
    mocks.cleanup.mockResolvedValue(2);
    mocks.rpc.mockResolvedValue({ data: 3, error: null });
    mocks.retention.mockResolvedValue({
      purged: 0,
      filesRemoved: 0,
      failed: 0,
      deferred: 0,
    });
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/exports"),
    );
    expect(response.status).toBe(401);
    expect(mocks.cleanup).not.toHaveBeenCalled();
  });

  it("removes expired exports for an authenticated cron request", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/exports", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      removed: 2,
      completed: 3,
      retention: { purged: 0, filesRemoved: 0, failed: 0, deferred: 0 },
      runId: expect.any(String),
      taskFailures: 0,
    });
    expect(mocks.cleanup).toHaveBeenCalledWith({ rpc: mocks.rpc });
    expect(mocks.rpc).toHaveBeenCalledWith("sync_completed_class_sessions", {
      p_organization_id: null,
    });
  });

  it("supports an authenticated read-only eligibility check without running cleanup", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: "expired" }], error: null });
    const response = await GET(
      new Request("http://localhost/api/cron/exports?dryRun=true", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(await response.json()).toEqual({
      dryRun: true,
      dueWorkspacesInBatch: 1,
    });
    expect(mocks.cleanup).not.toHaveBeenCalled();
    expect(mocks.retention).not.toHaveBeenCalled();
  });

  it("reports retention failures to the scheduler instead of a successful cleanup", async () => {
    mocks.retention.mockResolvedValue({
      purged: 0,
      filesRemoved: 0,
      failed: 1,
      deferred: 0,
    });
    const response = await GET(
      new Request("http://localhost/api/cron/exports", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(500);
  });
  it("runs retention and persists failure metadata even when export cleanup fails", async () => {
    mocks.cleanup.mockRejectedValue(new Error("storage unavailable"));
    mocks.rpc.mockImplementation(async (name: string) =>
      name === "record_maintenance_failure"
        ? { error: null }
        : { data: 3, error: null },
    );
    const response = await GET(
      new Request("http://localhost/api/cron/exports", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(response.status).toBe(500);
    expect(mocks.retention).toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_maintenance_failure",
      expect.objectContaining({ p_stage: "exports_cleanup" }),
    );
  });
});
