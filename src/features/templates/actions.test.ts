import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: m.current }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
import { saveTemplateAction, deactivateTemplateAction } from "./actions";
const org = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const id = "30000000-0000-4000-8000-000000000001";
function form(workspaceId = org) {
  const data = new FormData();
  data.set("workspaceId", workspaceId);
  data.set("name", "수업 보고서");
  data.set("fields", JSON.stringify([{ label: "내용", help_text: "", field_type: "long_text", required: true, options: [] }]));
  data.set("intent", "publish");
  data.set("confirm", "yes");
  return data;
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({ profile: { role: "admin", organization_id: org }, supabase: { rpc: m.rpc } });
  m.rpc.mockResolvedValue({ error: null });
});
it("refuses missing or switched workspace on creation and deletion without calling DB", async () => {
  for (const target of ["", other]) {
    expect((await saveTemplateAction({}, form(target))).error).toMatch(/워크스페이스/);
    expect((await deactivateTemplateAction(id, {}, form(target))).error).toMatch(/워크스페이스/);
  }
  expect(m.rpc).not.toHaveBeenCalled();
});
it("binds publishing and deletion to the workspace and returns to its settings", async () => {
  await expect(saveTemplateAction({}, form())).rejects.toThrow(`redirect:/workspaces/${org}/templates`);
  expect(m.rpc).toHaveBeenCalledWith("save_workspace_template", expect.objectContaining({ p_workspace_id: org, p_publish: true, p_name: "수업 보고서" }));
  await expect(deactivateTemplateAction(id, {}, form())).rejects.toThrow(`redirect:/workspaces/${org}/templates`);
  expect(m.rpc).toHaveBeenCalledWith("deactivate_workspace_template", { p_workspace_id: org, p_template_version_id: id });
  expect(m.revalidate).toHaveBeenCalledWith("/classes", "layout");
});
it("rejects coaches and reports DB workspace/role changes without redirecting", async () => {
  m.current.mockResolvedValueOnce({ profile: { role: "coach", organization_id: org } });
  expect((await saveTemplateAction({}, form())).error).toMatch(/관리자/);
  m.rpc.mockResolvedValue({ error: { code: "42501" } });
  expect((await saveTemplateAction({}, form())).error).toMatch(/권한이 변경/);
  expect(m.revalidate).not.toHaveBeenCalled();
});
