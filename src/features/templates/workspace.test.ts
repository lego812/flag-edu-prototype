import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: m.current }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not-found"); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
import { requireTemplateWorkspace } from "./workspace";
const org = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
beforeEach(() => { vi.resetAllMocks(); });
it("allows only the selected workspace administrator", async () => {
  const context = { workspace: { id: org }, workspaces: [{ id: org, role: "admin" }, { id: other, role: "coach" }] };
  m.current.mockResolvedValue(context);
  expect(await requireTemplateWorkspace(org)).toBe(context);
  await expect(requireTemplateWorkspace(other)).rejects.toThrow(`redirect:/workspaces/${other}`);
  m.current.mockResolvedValue({ ...context, workspace: { id: other } });
  await expect(requireTemplateWorkspace(org)).rejects.toThrow(`redirect:/workspaces/${org}`);
});
it("rejects invalid and unrelated workspace URLs", async () => {
  await expect(requireTemplateWorkspace("bad")).rejects.toThrow("not-found");
  expect(m.current).not.toHaveBeenCalled();
  m.current.mockResolvedValue({ workspaces: [], workspace: { id: other } });
  await expect(requireTemplateWorkspace(org)).rejects.toThrow("not-found");
});
