import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), rpc: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
import { inviteCoachAction, cancelInvitationAction } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    supabase: { rpc: m.rpc },
    profile: {
      role: "admin",
      organization_id: "20000000-0000-4000-8000-000000000001",
    },
  });
  m.rpc.mockResolvedValue({ error: null });
});
function form() {
  const f = new FormData();
  f.set("workspaceId", "20000000-0000-4000-8000-000000000001");
  f.set("email", "coach@example.com");
  f.set("invitationId", "10000000-0000-4000-8000-000000000001");
  return f;
}
it("registers an invitation without Auth user creation or email transport", async () => {
  expect((await inviteCoachAction({}, form())).success).toContain("앱");
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("invite_workspace_coach", {
    p_workspace_id: "20000000-0000-4000-8000-000000000001",
    p_email: "coach@example.com",
  });
});
it("rejects a coach before writing", async () => {
  m.current.mockResolvedValue({
    supabase: { rpc: m.rpc },
    profile: { role: "coach" },
  });
  expect((await inviteCoachAction({}, form())).error).toBeDefined();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("does not treat existing active membership as a successful invitation", async () => {
  m.rpc.mockResolvedValue({ error: { code: "PT409" } });
  expect((await inviteCoachAction({}, form())).error).toContain("참여");
});
it("cancels only through the authorized RPC", async () => {
  await cancelInvitationAction({}, form());
  expect(m.rpc).toHaveBeenCalledWith("cancel_workspace_invitation", {
    p_invitation_id: "10000000-0000-4000-8000-000000000001",
  });
});
it("rejects invalid email and invitation identifiers before authentication", async () => {
  const f = new FormData();
  await inviteCoachAction({}, f);
  await cancelInvitationAction({}, f);
  expect(m.current).not.toHaveBeenCalled();
});

it("rejects an invitation rendered for a workspace that is no longer selected", async () => {
  const f = form();
  f.set("workspaceId", "20000000-0000-4000-8000-000000000099");
  expect((await inviteCoachAction({}, f)).error).toContain("전환");
  expect(m.rpc).not.toHaveBeenCalled();
});
