// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/auth/current-user", () => ({
  requireAccount: async () => ({
    supabase: { rpc: m.rpc },
    user: { user_metadata: { role: "master" } },
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { requireMaster, masterAccount } from "./access";
beforeEach(() => vi.clearAllMocks());
it("requires database master approval regardless of editable metadata", async () => {
  m.rpc.mockResolvedValue({ data: false });
  await expect(requireMaster()).rejects.toThrow("NOT_FOUND");
  expect(m.rpc).toHaveBeenCalledWith("is_service_master");
});
it("fails closed on lookup failure and nonboolean responses", async () => {
  m.rpc.mockResolvedValue({ error: { message: "secret details" }, data: true });
  await expect(masterAccount()).rejects.toThrow("서비스 권한");
  for (const data of [null, "true", { role: "master" }]) {
    m.rpc.mockResolvedValue({ data });
    await expect(requireMaster()).rejects.toThrow("NOT_FOUND");
  }
});
it("allows a master without requiring a workspace or promoting a membership", async () => {
  m.rpc.mockResolvedValue({ data: true });
  expect((await requireMaster()).isMaster).toBe(true);
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
