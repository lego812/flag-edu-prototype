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
import { renameWorkspaceAction } from "./rename-actions";
const id = "20000000-0000-4000-8000-000000000001";
function form() {
  const f = new FormData();
  f.set("workspaceId", id);
  f.set("name", " 새 이름 ");
  f.set("expectedName", "기존 이름");
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    profile: { role: "coach" },
    workspaces: [{ id, role: "admin" }],
    supabase: { rpc: m.rpc },
  });
  m.rpc.mockResolvedValue({ error: null });
});
it("validates input before reading the account or writing", async () => {
  for (const [key, value] of [
    ["workspaceId", "bad"],
    ["name", " "],
    ["name", "x".repeat(101)],
    ["expectedName", ""],
  ]) {
    const f = form();
    f.set(key, value);
    expect((await renameWorkspaceAction({}, f)).error).toBeTruthy();
  }
  expect(m.current).not.toHaveBeenCalled();
});
it("uses the target administrator role and preserves optimistic concurrency input", async () => {
  expect((await renameWorkspaceAction({}, form())).success).toBeTruthy();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("rename_workspace", {
    p_workspace_id: id,
    p_name: "새 이름",
    p_expected_name: "기존 이름",
  });
  expect(m.cache).toHaveBeenCalledWith("/", "layout");
});
it("blocks foreign workspaces and target coaches despite an admin role elsewhere", async () => {
  for (const workspaces of [[], [{ id, role: "coach" }]]) {
    m.current.mockResolvedValue({
      profile: { role: "admin" },
      workspaces,
      supabase: { rpc: m.rpc },
    });
    expect((await renameWorkspaceAction({}, form())).error).toBeTruthy();
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it("shows concurrency conflicts without success or cache invalidation", async () => {
  m.rpc.mockResolvedValue({ error: { code: "40001" } });
  expect((await renameWorkspaceAction({}, form())).error).toContain("새로고침");
  expect(m.cache).not.toHaveBeenCalled();
});
