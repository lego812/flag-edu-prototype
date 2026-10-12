import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  current: vi.fn(),
  rpc: vi.fn(),
  cache: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("next/cache", () => ({ revalidatePath: m.cache }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import { deleteWorkspaceAction } from "./delete-actions";
const id = "20000000-0000-4000-8000-000000000001";
function form(name = "기관 A") {
  const f = new FormData();
  f.set("workspaceId", id);
  f.set("confirmationName", name);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    profile: { role: "coach" },
    workspaces: [{ id, name: "기관 A", role: "admin" }],
    supabase: { rpc: m.rpc },
  });
  m.rpc.mockResolvedValue({ error: null });
  m.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});
it("requires a valid id and a typed string before authentication", async () => {
  const invalid = form();
  invalid.set("workspaceId", "bad");
  await deleteWorkspaceAction({}, invalid);
  const file = form();
  file.set("confirmationName", new File(["기관 A"], "name.txt"));
  await deleteWorkspaceAction({}, file);
  await deleteWorkspaceAction({}, form(""));
  expect(m.current).not.toHaveBeenCalled();
});
it("matches the full current name exactly without trimming or case folding", async () => {
  for (const name of ["기관 a", "기관 A ", " 기관 A", "기관"])
    expect((await deleteWorkspaceAction({}, form(name))).error).toContain(
      "일치",
    );
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.cache).not.toHaveBeenCalled();
});
it("requires administrator membership in the target workspace", async () => {
  for (const workspaces of [[], [{ id, name: "기관 A", role: "coach" }]]) {
    m.current.mockResolvedValue({
      profile: { role: "admin" },
      workspaces,
      supabase: { rpc: m.rpc },
    });
    expect((await deleteWorkspaceAction({}, form())).error).toContain("관리자");
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it("deletes only the target and moves a last-workspace account to welcome", async () => {
  await expect(deleteWorkspaceAction({}, form())).rejects.toThrow("redirect");
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("delete_workspace", {
    p_workspace_id: id,
    p_confirmation_name: "기관 A",
  });
  expect(m.cache).toHaveBeenCalledWith("/", "layout");
  expect(m.redirect).toHaveBeenCalledWith("/welcome");
});
it("moves to remaining workspaces after success", async () => {
  m.current.mockResolvedValue({
    workspaces: [
      { id, name: "기관 A", role: "admin" },
      { id: "other", name: "기관 B", role: "coach" },
    ],
    supabase: { rpc: m.rpc },
  });
  await expect(deleteWorkspaceAction({}, form())).rejects.toThrow("redirect");
  expect(m.redirect).toHaveBeenCalledWith("/workspaces");
});
it("does not claim success when the database reports a concurrent rename or permission error", async () => {
  for (const code of ["PT409", "42501"]) {
    m.rpc.mockResolvedValue({ error: { code } });
    expect((await deleteWorkspaceAction({}, form())).error).toBeTruthy();
  }
  expect(m.cache).not.toHaveBeenCalled();
  expect(m.redirect).not.toHaveBeenCalled();
});
