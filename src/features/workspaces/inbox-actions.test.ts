import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  account: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/features/auth/current-user", () => ({ requireAccount: m.account }));
import { respondInvitationAction } from "./inbox-actions";
function form(d = "accept") {
  const f = new FormData();
  f.set("invitationId", "10000000-0000-4000-8000-000000000001");
  f.set("decision", d);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.account.mockResolvedValue({ supabase: { rpc: m.rpc } });
  m.rpc.mockResolvedValue({ error: null });
  m.redirect.mockImplementation((p: string) => {
    throw Error(p);
  });
});
it("accepts through the verified account and redirects only after successful DB response", async () => {
  await expect(respondInvitationAction({}, form())).rejects.toThrow(
    "/dashboard",
  );
  expect(m.rpc).toHaveBeenCalledWith("respond_workspace_invitation", {
    p_invitation_id: "10000000-0000-4000-8000-000000000001",
    p_accept: true,
  });
});
it("declines without selecting or creating a workspace", async () => {
  expect(await respondInvitationAction({}, form("decline"))).toEqual({});
  expect(m.rpc).toHaveBeenCalledWith("respond_workspace_invitation", {
    p_invitation_id: "10000000-0000-4000-8000-000000000001",
    p_accept: false,
  });
  expect(m.redirect).not.toHaveBeenCalled();
});
it("rejects malformed decision before reading account", async () => {
  expect(
    (await respondInvitationAction({}, form("unknown"))).error,
  ).toBeDefined();
  expect(m.account).not.toHaveBeenCalled();
});
it("does not navigate after expired/foreign invitation error", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await respondInvitationAction({}, form())).error).toBeDefined();
  expect(m.redirect).not.toHaveBeenCalled();
});
