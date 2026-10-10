import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  user: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import {
  finishInvitationAuthentication,
  acceptInvitationAction,
} from "./invitation-actions";
const token = "a".repeat(64);
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({ auth: { getUser: m.user }, rpc: m.rpc });
  m.user.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-10-10", user_metadata: {} } },
  });
  m.rpc.mockResolvedValue({ error: null });
  m.redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});
describe("verified invitation acceptance", () => {
  it("accepts the email-bound invitation after authentication and selects its workspace", async () => {
    expect(await finishInvitationAuthentication(token)).toEqual({
      next: "/dashboard",
    });
    expect(m.rpc).toHaveBeenCalledWith("accept_workspace_invitation", {
      p_token: token,
    });
  });
  it("routes new email-invited accounts through password setup before acceptance", async () => {
    m.user.mockResolvedValue({
      data: {
        user: {
          email_confirmed_at: "2026-10-10",
          user_metadata: { must_change_password: true },
        },
      },
    });
    expect(await finishInvitationAuthentication(token)).toEqual({
      next: `/set-password?next=%2Finvitations%2F${token}`,
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("rejects unverified sessions and malformed invitation tokens", async () => {
    m.user.mockResolvedValue({ data: { user: { id: "user" } } });
    expect((await finishInvitationAuthentication(token)).error).toBeDefined();
    expect((await finishInvitationAuthentication("bad")).error).toBeDefined();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ["42501", "이메일"],
    ["PT410", "만료"],
  ])("shows recoverable guidance for %s", async (code, message) => {
    m.rpc.mockResolvedValue({ error: { code } });
    expect((await finishInvitationAuthentication(token)).error).toContain(
      message,
    );
    expect(m.redirect).not.toHaveBeenCalled();
  });
  it("navigates only after explicit form acceptance succeeds", async () => {
    const f = new FormData();
    f.set("token", token);
    await expect(acceptInvitationAction({}, f)).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
  });
});
