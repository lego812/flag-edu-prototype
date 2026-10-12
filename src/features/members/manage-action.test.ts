import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: vi.fn(),
  rpc: vi.fn(),
  cache: vi.fn(),
}));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.cache }));
import { manageMemberAction } from "./manage-action";
const workspaceId = "20000000-0000-4000-8000-000000000001",
  id = "10000000-0000-4000-8000-000000000002";
function form() {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    workspaceId,
    id,
    role: "coach",
    status: "active",
    confirm: "yes",
  }))
    f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    profile: { id: "self", organization_id: workspaceId, role: "admin" },
    supabase: { rpc: m.rpc },
  });
  m.rpc.mockResolvedValue({ error: null });
});
it("rejects missing workspace scope from old forms", async () => {
  const f = form();
  f.delete("workspaceId");
  expect((await manageMemberAction({}, f)).error).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("rejects a valid old scope when selection moved after deletion", async () => {
  m.current.mockResolvedValue({
    profile: { id: "self", organization_id: "other", role: "admin" },
    supabase: { rpc: m.rpc },
  });
  expect((await manageMemberAction({}, form())).error).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("passes scope to the guarded RPC for normal changes", async () => {
  expect((await manageMemberAction({}, form())).success).toBeTruthy();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("manage_workspace_member", {
    p_workspace_id: workspaceId,
    p_user_id: id,
    p_role: "coach",
    p_status: "active",
  });
});
it("keeps denied requests retryable without invalidating data", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await manageMemberAction({}, form())).error).toBeTruthy();
  expect(m.cache).not.toHaveBeenCalled();
});
