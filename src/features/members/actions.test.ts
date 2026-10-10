import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  otp: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  single: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.current,
}));
vi.mock("@/lib/env", () => ({
  requireServerEnv: () => ({ siteUrl: "https://app.example.com" }),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { signInWithOtp: mocks.otp } }),
}));
import { inviteCoachAction, resendCoachInvitationAction } from "./actions";
const form = () => {
  const f = new FormData();
  f.set("invitationId", "f8601730-c133-41b8-8d69-316edc982195");
  f.set("email", "Coach@Example.com");
  return f;
};
describe("email-bound workspace invitations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.current.mockResolvedValue({
      profile: { role: "admin", organization_id: "org" },
      supabase: { rpc: mocks.rpc, from: mocks.from },
    });
    mocks.from.mockReturnValue({ select: () => ({ eq: mocks.eq }) });
    mocks.eq.mockReturnValue({ eq: mocks.eq, is: mocks.is });
    mocks.is.mockReturnValue({ maybeSingle: mocks.single });
    mocks.single.mockResolvedValue({ data: { email: "coach@example.com" } });
    mocks.rpc.mockResolvedValue({ data: "invite-id", error: null });
    mocks.otp.mockResolvedValue({ error: null });
  });
  it("requires only an email and sends an invitation without adding a member", async () => {
    expect((await inviteCoachAction({}, form())).success).toContain("수락");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("create_workspace_invitation", {
      p_email: "coach@example.com",
      p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const options = mocks.otp.mock.calls[0][0].options;
    const next = new URL(options.emailRedirectTo).searchParams.get("next")!;
    const token = next.split("/").at(-1)!;
    expect(mocks.rpc.mock.calls[0][1].p_token_hash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(options.shouldCreateUser).toBe(true);
  });
  it("resends using the current workspace's stored recipient", async () => {
    const f = form();
    f.set("email", "tampered@example.com");
    expect((await resendCoachInvitationAction({}, f)).success).toBeDefined();
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.is).toHaveBeenCalledWith("accepted_at", null);
    expect(mocks.otp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "coach@example.com" }),
    );
  });
  it("preserves the pending invitation when mail hits its limit", async () => {
    mocks.otp.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    expect((await inviteCoachAction({}, form())).error).toContain("대기 상태");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not send to an accepted or foreign workspace invitation", async () => {
    mocks.single.mockResolvedValue({ data: null });
    expect((await resendCoachInvitationAction({}, form())).error).toBeDefined();
    expect(mocks.otp).not.toHaveBeenCalled();
  });
  it("rejects coaches before querying invitations or sending mail", async () => {
    mocks.current.mockResolvedValue({ profile: { role: "coach" } });
    expect((await inviteCoachAction({}, form())).error).toContain("관리자");
    expect((await resendCoachInvitationAction({}, form())).error).toContain(
      "관리자",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.otp).not.toHaveBeenCalled();
  });
  it("does not send when invitation creation fails or the member is already active", async () => {
    mocks.rpc.mockResolvedValue({ error: { code: "PT409" } });
    expect((await inviteCoachAction({}, form())).error).toContain("이미");
    expect(mocks.otp).not.toHaveBeenCalled();
  });
  it("validates invitation identifiers and emails before accessing the server", async () => {
    const f = form();
    f.set("invitationId", "bad");
    f.set("email", "bad");
    expect((await inviteCoachAction({}, f)).error).toBeDefined();
    expect((await resendCoachInvitationAction({}, f)).error).toBeDefined();
    expect(mocks.current).not.toHaveBeenCalled();
  });
});
