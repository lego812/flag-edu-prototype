import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  redirect: vi.fn(),
  signInWithPassword: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: m }),
}));
import { setPasswordAction, loginAction } from "./actions";
beforeEach(() => {
  vi.resetAllMocks();
  m.getUser.mockResolvedValue({ data: { user: { id: "legacy" } } });
  m.updateUser.mockResolvedValue({ error: null });
  m.redirect.mockImplementation((p: string) => {
    throw Error(p);
  });
});
it("preserves password setup without granting any workspace membership", async () => {
  const f = new FormData();
  f.set("password", "existing-password");
  f.set("passwordConfirm", "existing-password");
  await expect(setPasswordAction({}, f)).rejects.toThrow("/welcome");
  expect(m.updateUser).toHaveBeenNthCalledWith(1, {
    password: "existing-password",
  });
  expect(m.updateUser).toHaveBeenNthCalledWith(2, {
    data: { must_change_password: false },
  });
});
it("keeps legacy password login", async () => {
  m.signInWithPassword.mockResolvedValue({
    data: { user: { user_metadata: {} } },
    error: null,
  });
  const f = new FormData();
  f.set("email", "legacy@example.com");
  f.set("password", "legacy-password");
  await expect(loginAction({}, f)).rejects.toThrow("/dashboard");
  expect(m.signInWithPassword).toHaveBeenCalledWith({
    email: "legacy@example.com",
    password: "legacy-password",
  });
});
it("does not redirect when password update fails", async () => {
  m.updateUser.mockResolvedValue({ error: { code: "failure" } });
  const f = new FormData();
  f.set("password", "existing-password");
  f.set("passwordConfirm", "existing-password");
  expect((await setPasswordAction({}, f)).error).toBeDefined();
  expect(m.redirect).not.toHaveBeenCalled();
});
