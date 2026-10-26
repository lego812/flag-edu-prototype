// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { getReport, listReports, listReportSummaries, type ReportFilters } from "./repository";
import { classRepository } from "@/features/classes/repository";

function fixture(data: unknown[] = []) {
  const requests: { url: URL; body?: unknown }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(url.pathname.includes("/rpc/") ? 0 : data), {
      headers: { "Content-Type": "application/json", "Content-Range": "0-0/21" },
    });
  });
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch },
  });
  return { client, requests };
}
const filters: ReportFilters = {
  from: "2026-02-01", to: "2026-02-28", status: "all",
  author: "another-author", session: "session-a", page: 2,
};

it("loads small report cards while preserving tenant/coach restrictions and Seoul date pagination", async () => {
  const card = { id: "report", created_at: "now", profiles: { name: "Coach" }, class_sessions: { title: "Class", location: "Center", start_at: "2026-02-01T01:00:00Z", has_time: true } };
  const { client, requests } = fixture([card]);
  const result = await listReportSummaries(client, "org-a", filters, "coach-a");
  expect(result.error).toBeNull();
  expect(result.data).toEqual([card]);
  expect(result.count).toBe(21);
  expect(requests[0].body).toEqual({ p_organization_id: "org-a" });
  const q = requests[1].url.searchParams;
  expect(q.get("select")).not.toMatch(/\*|report_answers|report_attachments|storage_path/);
  expect(q.get("select")).toContain("class_sessions!inner(title,location,start_at,has_time)");
  expect(q.get("organization_id")).toBe("eq.org-a");
  expect(q.get("author_id")).toBe("eq.coach-a");
  expect(q.get("class_session_id")).toBe("eq.session-a");
  expect(q.getAll("class_sessions.start_at")).toEqual(["gte.2026-02-01T00:00:00+09:00", "lt.2026-03-01T00:00:00+09:00"]);
  expect(q.get("order")).toBe("updated_at.desc,id.asc");
  expect(q.get("offset")).toBe("20");
  expect(q.get("limit")).toBe("20");
});

it("keeps full answer and ordered attachment data for exports and supports the admin author filter", async () => {
  const report = { id: "report", profiles: { name: "Coach" }, report_answers: [{ field_id: "field", value: "Answer" }], report_attachments: [
    { id: "b", storage_path: "b", created_at: "2026-10-02" },
    { id: "a", storage_path: "a", created_at: "2026-10-01" },
  ] };
  const { client, requests } = fixture([report]);
  const result = await listReports(client, "org-a", { ...filters, page: 1 }, undefined, 201);
  expect(result.data?.[0].report_answers[0].value).toBe("Answer");
  expect(result.data?.[0].report_attachments.map(a => a.id)).toEqual(["a", "b"]);
  const q = requests[1].url.searchParams;
  expect(q.get("select")).toMatch(/report_answers/);
  expect(q.get("select")).toMatch(/storage_path/);
  expect(q.get("author_id")).toBe("eq.another-author");
  expect(q.get("limit")).toBe("201");
});

it("limits class list fields without dropping completion sync, tenant/status filters or ordering", async () => {
  const { client, requests } = fixture();
  await classRepository(client, { id: "coach", organization_id: "org-a", role: "coach", status: "active" })
    .list({ from: "2026-10-01", to: "2026-10-31", status: "completed", sort: "oldest", page: 2 });
  expect(requests[0].url.pathname).toContain("sync_completed_class_sessions");
  const q = requests[1].url.searchParams;
  expect(q.get("select")).not.toMatch(/\*|memo|updated_by|updated_at/);
  expect(q.get("select")).toContain("teaching_method");
  expect(q.get("organization_id")).toBe("eq.org-a");
  expect(q.get("status")).toBe("eq.completed");
  expect(q.get("order")).toBe("start_at.asc,id.asc");
  expect(q.get("offset")).toBe("20");
});

it("resolves peer names for cards and details without opening private profiles", async () => {
  const requests: { path: string; body: unknown }[] = [];
  const report = { id: "report", author_id: "peer", profiles: null, report_attachments: [] };
  const client = createClient("https://example.supabase.co", "key", {
    auth: { persistSession: false }, global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      requests.push({ path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : null });
      const body = url.pathname.endsWith("list_report_authors") ? [{ id: "peer", name: "다른 코치" }]
        : url.pathname.includes("/rpc/") ? null : [report];
      return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const list = await listReportSummaries(client, "org", { ...filters, author: "", page: 1 });
  expect(list.data?.[0].profiles).toEqual({ name: "다른 코치" });
  const detail = await getReport(client, "report");
  expect(detail.data?.profiles).toEqual({ name: "다른 코치" });
  expect(requests.filter(r => r.path.endsWith("list_report_authors"))).toEqual([
    { path: "/rest/v1/rpc/list_report_authors", body: { p_author_ids: ["peer"] } },
    { path: "/rest/v1/rpc/list_report_authors", body: { p_author_ids: ["peer"] } },
  ]);
});
