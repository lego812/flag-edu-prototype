import { beforeEach, expect, it, vi } from "vitest";
import { saveReportAction } from "./actions";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn(), template: vi.fn(), rpc: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: mocks.auth }));
vi.mock("./repository", () => ({ getReport: mocks.report, getTemplate: mocks.template }));
const id = "10000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ profile: { id: "reader", role: "coach" }, supabase: { rpc: mocks.rpc } });
  // The new SELECT policy makes this report visible; that must not permit writes.
  mocks.report.mockResolvedValue({ data: { id, author_id: "another-coach" } });
});
it.each(["draft", "submit"])("rejects a coach's direct %s action on a readable peer report", async (intent) => {
  const form = new FormData();
  form.set("intent", intent);
  expect(await saveReportAction(id, {}, form)).toEqual({ error: "보고서를 수정할 권한이 없습니다." });
  expect(mocks.template).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
