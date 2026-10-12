// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: m.getUser },
    rpc: m.rpc,
    from: m.from,
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
import { requireAccount } from "./current-user";
beforeEach(() => {
  vi.clearAllMocks();
  m.getUser.mockResolvedValue({
    data: {
      user: {
        id: "user",
        email_confirmed_at: "now",
        user_metadata: { consent: true },
      },
    },
  });
  m.rpc.mockResolvedValue({ data: true, error: null });
  m.from.mockReturnValue({
    select: () => ({
      eq: () => ({ single: async () => ({ data: { id: "user" } }) }),
    }),
  });
});
it("routes unconsented accounts to signup before reading profiles, ignoring editable metadata", async () => {
  m.rpc.mockResolvedValue({ data: false, error: null });
  await expect(requireAccount()).rejects.toThrow("REDIRECT:/signup/consent");
  expect(m.from).not.toHaveBeenCalled();
});
it("fails closed on a consent lookup error", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: "internal" } });
  await expect(requireAccount()).rejects.toThrow("가입 동의 상태");
  expect(m.from).not.toHaveBeenCalled();
});
it("allows accepted and existing accounts through the same database authorization check", async () => {
  expect((await requireAccount()).profile.id).toBe("user");
  expect(m.rpc).toHaveBeenCalledWith("has_signup_consent");
});
