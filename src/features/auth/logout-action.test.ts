import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  signout: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import { logoutAction } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({ auth: { signOut: m.signout } });
  m.signout.mockResolvedValue({ error: null });
  m.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
});
it("rejects a request without confirmation before touching the session", async () => {
  expect((await logoutAction({}, new FormData())).error).toBeTruthy();
  expect(m.client).not.toHaveBeenCalled();
});
it("ends only the current session and redirects after success", async () => {
  const f = new FormData();
  f.set("confirm", "yes");
  await expect(logoutAction({}, f)).rejects.toThrow("redirect");
  expect(m.signout).toHaveBeenCalledExactlyOnceWith({ scope: "local" });
  expect(m.redirect).toHaveBeenCalledWith("/login");
});
it("returns auth errors without pretending logout succeeded", async () => {
  m.signout.mockResolvedValue({ error: { message: "failure" } });
  const f = new FormData();
  f.set("confirm", "yes");
  expect((await logoutAction({}, f)).error).toBeTruthy();
  expect(m.redirect).not.toHaveBeenCalled();
});
