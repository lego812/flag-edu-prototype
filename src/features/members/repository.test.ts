import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { listWorkspaceAuthors } from "./repository";

describe("workspace author filters", () => {
  it("includes members even when their currently selected workspace differs", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [
        { user_id: "coach-in-b", profiles: { name: "하 코치" } },
        { user_id: "inactive-member", profiles: { name: "가 코치" } },
      ],
      error: null,
    });
    const from = vi.fn(() => ({ select: () => ({ eq }) }));
    const result = await listWorkspaceAuthors(
      { from } as unknown as SupabaseClient,
      "workspace-a",
    );
    expect(from).toHaveBeenCalledWith("workspace_memberships");
    expect(eq).toHaveBeenCalledWith("organization_id", "workspace-a");
    expect(result.data).toEqual([
      { id: "inactive-member", name: "가 코치" },
      { id: "coach-in-b", name: "하 코치" },
    ]);
  });
});
