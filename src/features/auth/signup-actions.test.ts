import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  client: vi.fn(),
  signup: vi.fn(),
  verify: vi.fn(),
  resend: vi.fn(),
  signout: vi.fn(),
  rpc: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: m.client }));
vi.mock("@/lib/env", () => ({
  requireServerEnv: () => ({ siteUrl: "https://app.example.com" }),
}));
vi.mock("next/navigation", () => ({ redirect: m.redirect }));
import {
  signupAction,
  verifySignupAction,
  resendSignupAction,
} from "./signup-actions";
const form = () => {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    name: "공개 가입",
    email: "New@Example.com",
    password: "new-password",
    passwordConfirm: "new-password",
    code: "123456",
    next: "/welcome",
  }))
    f.set(k, v);
  return f;
};
beforeEach(() => {
  vi.resetAllMocks();
  m.client.mockResolvedValue({
    auth: {
      signUp: m.signup,
      verifyOtp: m.verify,
      resend: m.resend,
      signOut: m.signout,
    },
    rpc: m.rpc,
  });
  m.signup.mockResolvedValue({ data: { session: null }, error: null });
  m.verify.mockResolvedValue({
    data: { user: { email_confirmed_at: "2026-10-10" } },
    error: null,
  });
  m.rpc.mockResolvedValue({ error: null });
  m.resend.mockResolvedValue({ error: null });
  m.redirect.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
});
describe("public email signup", () => {
  it("sends verification without requiring an admin invitation or granting access", async () => {
    await expect(signupAction({}, form())).rejects.toThrow(
      "NEXT_REDIRECT:/signup/verify?email=new%40example.com&next=%2Fwelcome",
    );
    expect(m.signup).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "new-password",
      options: {
        data: { name: "공개 가입" },
        emailRedirectTo:
          "https://app.example.com/auth/callback?next=%2Fwelcome",
      },
    });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("fails closed when the project would auto-confirm the signup", async () => {
    m.signup.mockResolvedValue({ data: { session: {} }, error: null });
    expect((await signupAction({}, form())).error).toContain("이메일 인증");
    expect(m.signout).toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });
  it("validates all signup inputs before calling auth", async () => {
    const f = form();
    f.set("passwordConfirm", "different");
    expect((await signupAction({}, f)).error).toContain("일치");
    f.set("email", "bad");
    expect((await signupAction({}, f)).error).toBeDefined();
    expect(m.signup).not.toHaveBeenCalled();
  });
  it("verifies a numeric code and provisions only an account", async () => {
    await expect(verifySignupAction({}, form())).rejects.toThrow(
      "NEXT_REDIRECT:/welcome",
    );
    expect(m.verify).toHaveBeenCalledWith({
      email: "new@example.com",
      token: "123456",
      type: "email",
    });
    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(m.rpc).toHaveBeenCalledWith("ensure_my_profile");
  });
  it("rejects expired or incorrect codes and preserves a retry path", async () => {
    m.verify.mockResolvedValue({ data: {}, error: { code: "otp_expired" } });
    expect((await verifySignupAction({}, form())).error).toContain("만료");
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.redirect).not.toHaveBeenCalled();
  });
  it("rejects malformed codes without an auth request", async () => {
    const f = form();
    f.set("code", "12abcd");
    expect((await verifySignupAction({}, f)).error).toContain("6자리");
    expect(m.verify).not.toHaveBeenCalled();
  });
  it("resends through the existing signup verification mail transport", async () => {
    expect((await resendSignupAction({}, form())).success).toContain(
      "인증코드",
    );
    expect(m.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      options: {
        emailRedirectTo:
          "https://app.example.com/auth/callback?next=%2Fwelcome",
      },
    });
  });
  it("reports mail rate limits without exposing provider internals", async () => {
    m.resend.mockResolvedValue({ error: { status: 429 } });
    expect((await resendSignupAction({}, form())).error).toContain("잠시 후");
  });
  it("preserves an invitation continuation and rejects external redirects", async () => {
    const f = form();
    f.set("next", "/invitations/" + "a".repeat(64));
    await expect(verifySignupAction({}, f)).rejects.toThrow(
      "NEXT_REDIRECT:/invitations/",
    );
    f.set("next", "https://attacker.example.com/");
    await expect(verifySignupAction({}, f)).rejects.toThrow(
      "NEXT_REDIRECT:/welcome",
    );
  });
});
