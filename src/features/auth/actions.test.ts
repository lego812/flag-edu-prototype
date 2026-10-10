import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createAdminClient: vi.fn(),
  redirect: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  adminFrom: vi.fn(),
  adminRpc: vi.fn(),
  profileSingle: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

import { setPasswordAction } from "./actions";

function passwordForm() {
  const form = new FormData();
  form.set("password", "new-password");
  form.set("passwordConfirm", "new-password");
  return form;
}

describe("password setup activation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser, updateUser: mocks.updateUser },
    });
    mocks.createAdminClient.mockReturnValue({
      from: mocks.adminFrom,
      rpc: mocks.adminRpc,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "member-id" } } });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.profileSingle.mockResolvedValue({
      data: { status: "pending" },
      error: null,
    });
    mocks.adminRpc.mockResolvedValue({ error: null });
    mocks.adminFrom.mockReturnValue({
      select: () => ({
        eq: () => ({ single: mocks.profileSingle }),
      }),
    });
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });
  });

  it("activates only a pending profile after the password is updated", async () => {
    await expect(setPasswordAction({}, passwordForm())).rejects.toThrow(
      "NEXT_REDIRECT",
    );

    expect(mocks.updateUser).toHaveBeenNthCalledWith(1, {
      password: "new-password",
    });
    expect(mocks.adminRpc).toHaveBeenCalledWith("activate_invited_user", {
      p_user_id: "member-id",
    });
    expect(mocks.updateUser).toHaveBeenNthCalledWith(2, {
      data: { must_change_password: false },
    });
  });

  it("keeps the password-change flag when pending activation fails", async () => {
    mocks.adminRpc.mockResolvedValue({ error: { code: "P0001" } });

    const result = await setPasswordAction({}, passwordForm());

    expect(result.error).toContain("가입을 완료하지 못했습니다");
    expect(mocks.updateUser).toHaveBeenCalledTimes(1);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
