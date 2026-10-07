import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { dynamic, GET } from "./route";

vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: vi.fn() }));

describe("current workspace identity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the authenticated identity with private no-store caching", async () => {
    vi.mocked(requireCurrentProfile).mockResolvedValue({
      profile: { id: "user-1", name: "private name", organization_id: "workspace-1", role: "admin" },
      workspace: { id: "workspace-1", name: "private workspace", role: "admin" },
    } as never);
    const response = await GET();
    expect(await response.json()).toEqual({ userId: "user-1", workspaceId: "workspace-1" });
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(dynamic).toBe("force-dynamic");
  });

  it("keeps the existing authentication and active membership guard", async () => {
    const denied = new Error("NEXT_REDIRECT");
    vi.mocked(requireCurrentProfile).mockRejectedValue(denied);
    await expect(GET()).rejects.toBe(denied);
    expect(requireCurrentProfile).toHaveBeenCalledOnce();
  });
});
