import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { removeParticipantAction } from "./participant-actions";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const self = "10000000-0000-4000-8000-000000000001";
function form() {
  const f = new FormData();
  f.set("workspaceId", workspaceId);
  f.set("userId", userId);
  f.set("confirm", "yes");
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    profile: { id: self, role: "coach" },
    workspaces: [{ id: workspaceId, role: "admin" }],
    supabase: { rpc: m.rpc },
  });
  m.rpc.mockResolvedValue({ error: null });
});
it("requires valid ids and explicit confirmation before auth or mutation", async () => {
  for (const field of ["workspaceId", "userId", "confirm"]) {
    const f = form();
    f.set(field, "invalid");
    expect((await removeParticipantAction({}, f)).error).toBeTruthy();
  }
  expect(m.current).not.toHaveBeenCalled();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("uses admin role in the target workspace rather than selected role", async () => {
  expect((await removeParticipantAction({}, form())).success).toBeTruthy();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith(
    "remove_workspace_participant",
    { p_workspace_id: workspaceId, p_user_id: userId },
  );
  expect(m.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("blocks self, nonmember and coach requests", async () => {
  const f = form();
  f.set("userId", self);
  expect((await removeParticipantAction({}, f)).error).toBeTruthy();
  for (const workspaces of [[], [{ id: workspaceId, role: "coach" }]]) {
    m.current.mockResolvedValue({
      profile: { id: self, role: "admin" },
      workspaces,
      supabase: { rpc: m.rpc },
    });
    expect((await removeParticipantAction({}, form())).error).toBeTruthy();
  }
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});
it("keeps failed removal retryable without success or cache invalidation", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  const result = await removeParticipantAction({}, form());
  expect(result.error).toBeTruthy();
  expect(result.success).toBeUndefined();
  expect(m.revalidate).not.toHaveBeenCalled();
});
