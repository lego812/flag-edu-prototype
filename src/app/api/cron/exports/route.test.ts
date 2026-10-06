// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({
  cleanup: vi.fn(),
  admin: vi.fn(),
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
    mocks.admin.mockReturnValue({});
    mocks.cleanup.mockResolvedValue(2);
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
    await expect(response.json()).resolves.toEqual({ removed: 2 });
    expect(mocks.cleanup).toHaveBeenCalledWith({});
  });
});
