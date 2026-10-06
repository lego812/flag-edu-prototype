// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanupExpiredExports } from "./cleanup";

describe("expired export cleanup", () => {
  it("removes expired files and clears their storage paths", async () => {
    const query = {
      not: vi.fn(),
      lte: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: [
          { id: "job-1", storage_path: "org/admin/job-1.pdf" },
          { id: "job-2", storage_path: "org/admin/job-2.xlsx" },
        ],
        error: null,
      }),
    };
    query.not.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    const update = { in: vi.fn().mockResolvedValue({ error: null }) };
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: vi.fn().mockReturnValue(query) })
      .mockReturnValueOnce({ update: vi.fn().mockReturnValue(update) });
    const remove = vi.fn().mockResolvedValue({ error: null });
    const client = {
      from,
      storage: { from: vi.fn().mockReturnValue({ remove }) },
    } as unknown as SupabaseClient;

    await expect(
      cleanupExpiredExports(client, "2026-10-13T00:00:00.000Z"),
    ).resolves.toBe(2);
    expect(remove).toHaveBeenCalledWith([
      "org/admin/job-1.pdf",
      "org/admin/job-2.xlsx",
    ]);
    expect(update.in).toHaveBeenCalledWith("id", ["job-1", "job-2"]);
  });

  it("does not call storage when there is nothing to remove", async () => {
    const query = {
      not: vi.fn(),
      lte: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    query.not.mockReturnValue(query);
    query.lte.mockReturnValue(query);
    const storageFrom = vi.fn();
    const client = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(query),
      }),
      storage: { from: storageFrom },
    } as unknown as SupabaseClient;

    await expect(cleanupExpiredExports(client)).resolves.toBe(0);
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
