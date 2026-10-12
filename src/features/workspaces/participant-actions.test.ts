import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
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
  m.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
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
it("blocks nonmember and coach removal of others", async () => {
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

it("lets coaches leave themselves and redirects away from a departed last workspace", async () => {
  m.current.mockResolvedValue({
    profile: { id: self, role: "coach" },
    workspaces: [{ id: workspaceId, role: "coach" }],
    supabase: { rpc: m.rpc },
  });
  const f = form();
  f.set("userId", self);
  await expect(removeParticipantAction({}, f)).rejects.toThrow("redirect");
  expect(m.rpc).toHaveBeenCalledWith("remove_workspace_participant", {
    p_workspace_id: workspaceId,
    p_user_id: self,
  });
  expect(m.redirect).toHaveBeenCalledWith("/welcome");
});
it("last administrator leave stays retryable without redirection", async () => {
  m.rpc.mockResolvedValue({ error: { code: "23514" } });
  const f = form();
  f.set("userId", self);
  expect((await removeParticipantAction({}, f)).error).toContain("다른 참여자");
  expect(m.redirect).not.toHaveBeenCalled();
  expect(m.revalidate).not.toHaveBeenCalled();
});
