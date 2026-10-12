import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  published: true,
  getUser: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("./legal-policy", () => ({
  get SIGNUP_POLICY_PUBLISHED() {
    return m.published;
  },
  SIGNUP_POLICY_VERSION: "2026-10-12",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: m.getUser }, rpc: m.rpc }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error("REDIRECT:" + url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
import { acceptSignupConsentAction } from "./consent-action";
function form() {
  const f = new FormData();
  f.set("terms", "yes");
  f.set("privacy", "yes");
  f.set("policyVersion", "2026-10-12");
  return f;
}
beforeEach(() => {
  vi.clearAllMocks();
  m.published = true;
  m.getUser.mockResolvedValue({
    data: { user: { id: "own", email_confirmed_at: "now" } },
  });
  m.rpc.mockResolvedValue({ error: null });
});
it("refuses unpublished, unchecked or outdated terms without a database write", async () => {
  const f = form();
  f.delete("privacy");
  expect((await acceptSignupConsentAction({}, f)).error).toBeTruthy();
  f.set("privacy", "yes");
  f.set("policyVersion", "old");
  expect((await acceptSignupConsentAction({}, f)).error).toContain("변경");
  m.published = false;
  expect((await acceptSignupConsentAction({}, form())).error).toContain("준비");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("requires an authenticated verified account", async () => {
  m.getUser.mockResolvedValue({ data: { user: null } });
  await expect(acceptSignupConsentAction({}, form())).rejects.toThrow(
    "REDIRECT:/login",
  );
  m.getUser.mockResolvedValue({ data: { user: { id: "own" } } });
  expect((await acceptSignupConsentAction({}, form())).error).toBeTruthy();
  expect(m.rpc).not.toHaveBeenCalled();
});
it("stores both checked consents with the server version and ignores submitted identity and timestamp", async () => {
  const f = form();
  f.set("userId", "other");
  f.set("acceptedAt", "forged");
  await expect(acceptSignupConsentAction({}, f)).rejects.toThrow(
    "REDIRECT:/welcome",
  );
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith("accept_signup_consents", {
    p_policy_version: "2026-10-12",
    p_terms: true,
    p_privacy: true,
  });
  expect(m.revalidate).toHaveBeenCalledWith("/", "layout");
});
it("preserves the form on a failed save and hides internal errors", async () => {
  m.rpc.mockResolvedValue({ error: { message: "private error" } });
  expect((await acceptSignupConsentAction({}, form())).error).toContain(
    "다시 시도",
  );
  expect(m.revalidate).not.toHaveBeenCalled();
});
