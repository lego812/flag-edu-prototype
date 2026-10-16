// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ account: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/master/access", () => ({ masterAccount: m.account }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
import { getInquiry } from "./repository";
const id = "20000000-0000-4000-8000-000000000100";
beforeEach(() => {
  vi.clearAllMocks();
  m.account.mockResolvedValue({ supabase: { rpc: m.rpc } });
});
it("checks the account and masks nonexistent and other-authors IDs equally", async () => {
  m.rpc.mockResolvedValue({ data: null });
  await expect(getInquiry(id)).rejects.toThrow("NOT_FOUND");
  expect(m.rpc).toHaveBeenCalledWith("get_support_inquiry", { p_id: id });
  m.rpc.mockClear();
  await expect(getInquiry("invalid")).rejects.toThrow("NOT_FOUND");
  expect(m.rpc).not.toHaveBeenCalled();
  m.account.mockRejectedValue(new Error("LOGIN"));
  await expect(getInquiry(id)).rejects.toThrow("LOGIN");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("does not turn database outages into missing inquiries or leak internals", async () => {
  m.rpc.mockResolvedValue({ error: { message: "private error" } });
  await expect(getInquiry(id)).rejects.toThrow("문의글을 불러오지 못했습니다");
});
