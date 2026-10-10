import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
import { setPasswordAction } from "./actions";
const token = "a".repeat(64);
function form(next = "/dashboard") {
  const f = new FormData();
  f.set("password", "new-password");
  f.set("passwordConfirm", "new-password");
  f.set("next", next);
  return f;
}
describe("password setup and invitation separation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
      rpc: mocks.rpc,
    });
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "member-id", email_confirmed_at: "2026-10-10" } },
    });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
  });
  it("sets a password without granting any workspace membership", async () => {
    await expect(setPasswordAction({}, form())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, {
      password: "new-password",
    });
    expect(mocks.rpc).toHaveBeenCalledWith("ensure_my_profile");
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "activate_invited_user",
      expect.anything(),
    );
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "accept_workspace_invitation",
      expect.anything(),
    );
    expect(mocks.updateUser).toHaveBeenNthCalledWith(2, {
      data: { must_change_password: false },
    });
  });
  it("accepts only the particular mail invitation after password setup", async () => {
    await expect(
      setPasswordAction({}, form(`/invitations/${token}`)),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mocks.rpc).toHaveBeenCalledWith("accept_workspace_invitation", {
      p_token: token,
    });
  });
  it("keeps the setup flag when account provisioning fails", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "P0001" } });
    expect((await setPasswordAction({}, form())).error).toBeDefined();
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
  it("rejects unverified email before changing a password", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user" } } });
    expect((await setPasswordAction({}, form())).error).toBeDefined();
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("returns to the invitation when acceptance fails after password setup", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      error: name === "accept_workspace_invitation" ? { code: "PT410" } : null,
    }));
    await expect(
      setPasswordAction({}, form(`/invitations/${token}`)),
    ).rejects.toThrow(`NEXT_REDIRECT:/invitations/${token}`);
  });
});
