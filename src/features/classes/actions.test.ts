import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), cancel: vi.fn(), redirect: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: mocks.context }));
vi.mock("./repository", () => ({ classRepository: () => mocks }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { createClassAction, updateClassAction, cancelClassAction } from "./actions";
const id = "f8601730-c133-41b8-8d69-316edc982195";
function form() {
  const value = new FormData();
  Object.entries({ title: "수업", location: "센터", start: "2026-09-22T14:00", end: "2026-09-22T15:00", memo: "", version: "version-1", confirm: "yes", organization_id: "attacker", status: "scheduled" }).forEach(([key, text]) => value.set(key, text));
  return value;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.context.mockResolvedValue({ supabase: {}, profile: { id: "owner", organization_id: "org", role: "coach", status: "active" } });
  mocks.get.mockResolvedValue({ data: { id, created_by: "owner", organization_id: "org", status: "scheduled", updated_at: "version-1" } });
  mocks.create.mockResolvedValue({ data: { id } });
  mocks.update.mockResolvedValue({ data: { id } });
  mocks.cancel.mockResolvedValue({ error: null });
  mocks.redirect.mockImplementation((url: string) => { throw new Error("REDIRECT:" + url); });
});
it("creates from whitelisted fields and redirects to the new class", async () => {
  await expect(createClassAction({}, form())).rejects.toThrow("REDIRECT:/classes/" + id);
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("organization_id");
  expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("status");
});
it("rejects non-owner modifications before writes", async () => {
  mocks.context.mockResolvedValue({ supabase: {}, profile: { id: "other", organization_id: "org", role: "coach", status: "active" } });
  expect((await updateClassAction(id, {}, form())).error).toBeDefined();
  expect((await cancelClassAction(id, {}, form())).error).toBeDefined();
  expect(mocks.update).not.toHaveBeenCalled();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it("rejects stale edits without overwriting data", async () => {
  const data = form(); data.set("version", "old");
  expect((await updateClassAction(id, {}, data)).error).toContain("다른 사용자");
  expect(mocks.update).not.toHaveBeenCalled();
});
it("reports a concurrent update that occurred after the permission check", async () => {
  mocks.update.mockResolvedValue({ data: null });
  expect((await updateClassAction(id, {}, form())).error).toContain("변경");
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("requires explicit cancellation confirmation", async () => {
  const data = form(); data.delete("confirm");
  expect((await cancelClassAction(id, {}, data)).error).toBeDefined();
  expect(mocks.cancel).not.toHaveBeenCalled();
});
it("cancels through the RPC and reports server rejection", async () => {
  mocks.cancel.mockResolvedValue({ error: { code: "42501" } });
  expect((await cancelClassAction(id, {}, form())).error).toBeDefined();
  expect(mocks.cancel).toHaveBeenCalledWith(id);
  expect(mocks.redirect).not.toHaveBeenCalled();
});
it("preserves form input on network failure", async () => {
  mocks.create.mockRejectedValue(new Error("offline"));
  expect(await createClassAction({}, form())).toMatchObject({ error: expect.any(String), values: { title: "수업" } });
});
