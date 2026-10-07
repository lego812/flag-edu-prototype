import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  rpc: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.current,
}));

import { createWorkspaceAction, switchWorkspaceAction } from "./actions";

const currentId = "f8601730-c133-41b8-8d69-316edc982195";
const nextId = "b91c4416-12ea-49e8-b061-82f9f4f9eb11";

function switchForm(id = nextId) {
  const data = new FormData();
  data.set("workspaceId", id);
  return data;
}

function createForm(name = "두 번째 기관") {
  const data = new FormData();
  data.set("name", name);
  return data;
}

describe("workspace actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.current.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
      profile: { role: "admin" },
      workspace: { id: currentId, name: "기관 A", role: "admin" },
      workspaces: [
        { id: currentId, name: "기관 A", role: "admin" },
        { id: nextId, name: "기관 B", role: "coach" },
      ],
    });
  });

  it("switches only to an active workspace membership", async () => {
    await expect(switchWorkspaceAction(switchForm())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("switch_workspace", {
      p_organization_id: nextId,
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("rejects a workspace outside the returned memberships", async () => {
    await expect(
      switchWorkspaceAction(
        switchForm("aa039bfd-16f6-4f5b-b108-6d292ed2454a"),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/access-denied");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("creates and immediately selects a workspace for administrators", async () => {
    await expect(createWorkspaceAction({}, createForm())).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(mocks.rpc).toHaveBeenCalledWith("create_workspace", {
      p_name: "두 번째 기관",
    });
  });

  it("prevents coaches from creating workspaces", async () => {
    mocks.current.mockResolvedValue({
      supabase: { rpc: mocks.rpc },
      profile: { role: "coach" },
    });
    const result = await createWorkspaceAction({}, createForm());
    expect(result.error).toContain("관리자");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates workspace names before writing", async () => {
    const result = await createWorkspaceAction({}, createForm("A"));
    expect(result.error).toContain("2~100자");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
