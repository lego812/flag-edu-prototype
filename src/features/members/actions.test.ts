import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  current: vi.fn(), invite: vi.fn(), recovery: vi.fn(), getUser: vi.fn(),
  single: vi.fn(), remove: vi.fn(), deleteUser: vi.fn(),
  eq: vi.fn(), select: vi.fn(), rpc: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: mocks.current }));
vi.mock("@/lib/env", () => ({ requireServerEnv: () => ({ siteUrl: "http://localhost:3000" }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { inviteUserByEmail: mocks.invite, getUserById: mocks.getUser, deleteUser: mocks.deleteUser }, resetPasswordForEmail: mocks.recovery },
    from: () => ({ select: mocks.select, delete: mocks.remove }),
  }),
}));
import { inviteCoachAction, resendCoachInvitationAction } from "./actions";
const form = () => {
  const data = new FormData();
  data.set("userId", "f8601730-c133-41b8-8d69-316edc982195");
  data.set("email", "coach@example.com");
  data.set("name", "코치");
  return data;
};
describe("invitation account preservation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.current.mockResolvedValue({
      profile: { role: "admin", organization_id: "org" },
      supabase: { rpc: mocks.rpc },
    });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ eq: mocks.eq, single: mocks.single });
    mocks.single.mockResolvedValue({
      data: { profiles: { name: "코치" }, status: "pending" },
    });
    mocks.getUser.mockResolvedValue({ data: { user: { email: "coach@example.com", user_metadata: { must_change_password: true } } } });
    mocks.invite.mockResolvedValue({ data: { user: { id: "existing" } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "find_workspace_user_by_email" ? null : undefined,
      error: null,
    }));
    mocks.recovery.mockResolvedValue({ error: null });
  });
  it("registers a new invitation in the current workspace", async () => {
    expect((await inviteCoachAction({}, form())).success).toBeDefined();
    expect(mocks.rpc).toHaveBeenCalledWith(
      "register_workspace_invitee",
      expect.objectContaining({ p_user_id: "existing", p_name: "코치" }),
    );
  });
  it("adds an existing account without sending another invitation", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data:
        name === "find_workspace_user_by_email"
          ? "f8601730-c133-41b8-8d69-316edc982195"
          : undefined,
      error: null,
    }));
    expect((await inviteCoachAction({}, form())).success).toContain(
      "워크스페이스",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("add_existing_workspace_member", {
      p_user_id: "f8601730-c133-41b8-8d69-316edc982195",
    });
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("preserves the account when sending hits the email limit", async () => {
    mocks.invite.mockResolvedValue({ data: {}, error: { code: "over_email_send_rate_limit", status: 429, message: "limited" } });
    expect((await resendCoachInvitationAction({}, form())).error).toContain("한도");
    expect(mocks.invite).toHaveBeenCalledTimes(1);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("sends recovery for confirmed users who still need a password", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { email: "coach@example.com", email_confirmed_at: "2026-01-01", user_metadata: { must_change_password: true } } } });
    expect((await resendCoachInvitationAction({}, form())).success).toBeDefined();
    expect(mocks.recovery).toHaveBeenCalledTimes(1);
    expect(mocks.invite).not.toHaveBeenCalled();
  });
  it("rejects a target outside the current organization", async () => {
    mocks.single.mockResolvedValue({ data: null });
    expect((await resendCoachInvitationAction({}, form())).error).toBeDefined();
    expect(mocks.eq).toHaveBeenCalledWith("organization_id", "org");
    expect(mocks.invite).not.toHaveBeenCalled();
    expect(mocks.recovery).not.toHaveBeenCalled();
  });
  it("rejects coaches before accessing the admin API", async () => {
    mocks.current.mockResolvedValue({
      profile: { role: "coach" },
      supabase: { rpc: mocks.rpc },
    });
    expect((await resendCoachInvitationAction({}, form())).error).toBeDefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("does not delete an invited account after membership registration fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({
      data: name === "find_workspace_user_by_email" ? null : undefined,
      error: name === "register_workspace_invitee" ? { code: "23505" } : null,
    }));
    expect((await inviteCoachAction({}, form())).error).toBeDefined();
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
});
