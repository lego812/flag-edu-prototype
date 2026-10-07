// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  admin: vi.fn(),
  rpc: vi.fn(),
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
  });

  it("rejects requests without the cron secret", async () => {
    const response = await GET(new Request("http://localhost/api/cron/exports"));
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
    await expect(response.json()).resolves.toEqual({ removed: 2, completed: 3 });
    expect(mocks.cleanup).toHaveBeenCalledWith({ rpc: mocks.rpc });
    expect(mocks.rpc).toHaveBeenCalledWith("sync_completed_class_sessions", {
      p_organization_id: null,
    });
  });
});
