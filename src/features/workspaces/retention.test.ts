// @vitest-environment node
import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { purgeExpiredWorkspaces } from "./retention";

function fixture(objects: { bucket_id: string; name: string }[] = []) {
  let batch = 0;
  const rpc = vi.fn(async (name: string) => ({
    error: null,
    data:
      name === "list_workspaces_due_for_purge"
        ? [{ id: "expired" }]
        : name === "list_workspace_purge_objects"
          ? batch++ === 0
            ? objects
            : []
          : true,
  }));
  const remove = vi.fn().mockResolvedValue({ error: null });
  const client = {
    rpc,
    storage: { from: vi.fn().mockReturnValue({ remove }) },
  };
  return { rpc, remove, client: client as unknown as SupabaseClient };
}
it("removes scoped files via Storage before finalizing database deletion", async () => {
  const f = fixture([
    { bucket_id: "report-images", name: "expired/report/photo.jpg" },
    { bucket_id: "report-exports", name: "expired/report/export.pdf" },
  ]);
  expect(await purgeExpiredWorkspaces(f.client)).toEqual({
    purged: 1,
    filesRemoved: 2,
    failed: 0,
    deferred: 0,
  });
  expect(f.remove).toHaveBeenCalledWith(["expired/report/photo.jpg"]);
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual([
    "list_workspaces_due_for_purge",
    "begin_workspace_purge",
    "list_workspace_purge_objects",
    "list_workspace_purge_objects",
    "finish_workspace_purge",
  ]);
});
it("keeps records for retry when Storage fails and never finalizes", async () => {
  const f = fixture([
    { bucket_id: "report-images", name: "expired/report/photo.jpg" },
  ]);
  f.remove.mockResolvedValue({ error: { message: "unavailable" } });
  expect(await purgeExpiredWorkspaces(f.client)).toEqual({
    purged: 0,
    filesRemoved: 0,
    failed: 1,
    deferred: 0,
  });
  expect(
    f.rpc.mock.calls.some(([name]) => name === "finish_workspace_purge"),
  ).toBe(false);
});
it("refuses an unexpected path without deleting any file", async () => {
  const f = fixture([
    { bucket_id: "report-images", name: "active/report/photo.jpg" },
  ]);
  expect((await purgeExpiredWorkspaces(f.client)).failed).toBe(1);
  expect(f.remove).not.toHaveBeenCalled();
});
it("rechecks expiration after enumeration and stops if eligibility changed", async () => {
  const f = fixture();
  f.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "list_workspaces_due_for_purge" ? [{ id: "expired" }] : false,
  }));
  expect((await purgeExpiredWorkspaces(f.client)).purged).toBe(0);
  expect(f.rpc).toHaveBeenCalledTimes(2);
});

it("reports a deferred purge when its time budget expires between file batches, keeping database records", async () => {
  let now = 0;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  try {
    const f = fixture([
      { bucket_id: "report-exports", name: "expired/report/export.pdf" },
      { bucket_id: "report-images", name: "expired/report/photo.jpg" },
    ]);
    f.remove.mockImplementation(async () => {
      now = 36_000;
      return { error: null };
    });
    expect(await purgeExpiredWorkspaces(f.client)).toEqual({
      purged: 0,
      filesRemoved: 1,
      failed: 0,
      deferred: 1,
    });
    expect(f.remove).toHaveBeenCalledTimes(1);
    expect(
      f.rpc.mock.calls.some(([name]) => name === "finish_workspace_purge"),
    ).toBe(false);
  } finally {
    clock.mockRestore();
  }
});
