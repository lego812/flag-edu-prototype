import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ require: vi.fn(), rpc: vi.fn(), sign: vi.fn() }));
vi.mock("@/features/master/access", () => ({ requireMaster: m.require }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/manage/users",
  useSearchParams: () => new URLSearchParams(),
}));
import Users from "@/app/manage/(master)/users/page";
import Workspaces from "@/app/manage/(master)/all-workspaces/page";
import Workspace from "@/app/manage/(master)/all-workspaces/[id]/page";
import ReportPage from "@/app/manage/(master)/all-workspaces/[id]/reports/[reportId]/page";
import Layout from "@/app/manage/(master)/layout";
import { queryParams } from "./model";
const id = "10000000-0000-4000-8000-000000000001";
const reportId = "10000000-0000-4000-8000-000000000002";
const searchParams = Promise.resolve({});
beforeEach(() => {
  vi.clearAllMocks();
  m.require.mockResolvedValue({
    supabase: {
      rpc: m.rpc,
      storage: { from: () => ({ createSignedUrl: m.sign }) },
    },
  });
});
afterEach(cleanup);
it("guards every page independently, before fetching any private data", async () => {
  m.require.mockRejectedValue(new Error("NOT_FOUND"));
  for (const action of [
    () => Layout({ children: null }),
    () => Users({ searchParams }),
    () => Workspaces({ searchParams }),
    () => Workspace({ params: Promise.resolve({ id }), searchParams }),
    () => ReportPage({ params: Promise.resolve({ id, reportId }) }),
  ])
    await expect(action()).rejects.toThrow("NOT_FOUND");
  expect(m.rpc).not.toHaveBeenCalled();
  expect(m.sign).not.toHaveBeenCalled();
});
it("renders searchable users with separate legacy consent and workspace roles", async () => {
  m.rpc.mockResolvedValue({
    data: {
      total: 21,
      stats: { total: 21, recent: 3, without_workspace: 1 },
      items: [
        {
          id,
          name: "테스트 사용자",
          email: "user@example.test",
          created_at: "2026-10-16T00:00:00Z",
          last_sign_in_at: null,
          consent: "legacy_exempt",
          memberships: [
            { id, name: "테스트 공간", role: "coach", status: "inactive" },
          ],
        },
      ],
    },
  });
  render(
    await Users({ searchParams: Promise.resolve({ q: "user", page: "1" }) }),
  );
  expect(screen.getByText("기존 가입자 · 동의 면제")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "테스트 공간" })).toHaveAttribute(
    "href",
    `/manage/all-workspaces/${id}?section=members`,
  );
  expect(screen.getByRole("link", { name: "다음" })).toHaveAttribute(
    "href",
    "/manage/users?q=user&page=2",
  );
  expect(
    screen.queryByRole("button", { name: /삭제|비활성|수정/ }),
  ).not.toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledWith("master_users", {
    p_search: "user",
    p_page: 1,
  });
});
it("handles empty workspace searches and unavailable detail safely", async () => {
  m.rpc.mockResolvedValue({ data: { total: 0, items: [] } });
  render(await Workspaces({ searchParams }));
  expect(
    screen.getByText("표시할 워크스페이스가 없습니다."),
  ).toBeInTheDocument();
  m.rpc.mockResolvedValue({ data: null });
  await expect(
    Workspace({ params: Promise.resolve({ id }), searchParams }),
  ).rejects.toThrow("NOT_FOUND");
  await expect(
    ReportPage({ params: Promise.resolve({ id, reportId }) }),
  ).rejects.toThrow("NOT_FOUND");
});
it("shows read-only tabs and links to the isolated report reader", async () => {
  m.rpc.mockResolvedValue({
    data: {
      workspace: { id, name: "테스트 공간" },
      total: 1,
      items: [
        {
          id: reportId,
          title: "수업 예시",
          author: "예시 코치",
          status: "draft",
          created_at: "2026-10-16T00:00:00Z",
        },
      ],
    },
  });
  render(
    await Workspace({
      params: Promise.resolve({ id }),
      searchParams: Promise.resolve({ section: "reports" }),
    }),
  );
  expect(screen.getByRole("link", { name: "수업 예시" })).toHaveAttribute(
    "href",
    `/manage/all-workspaces/${id}/reports/${reportId}`,
  );
  expect(screen.getByRole("link", { name: "참여자·권한" })).toHaveAttribute(
    "href",
    `/manage/all-workspaces/${id}?section=members`,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("renders report answers with no edit/upload/delete even when edit=1 is added", async () => {
  m.rpc.mockResolvedValue({
    data: {
      workspace: { id, name: "테스트 공간" },
      report: {
        id: reportId,
        created_at: "2026-10-16T00:00:00Z",
        updated_at: "2026-10-16T00:00:00Z",
        status: "draft",
        profiles: { name: "코치" },
        class_sessions: {
          title: "수업 예시",
          location: "체육관",
          start_at: "2026-10-16T00:00:00Z",
          status: "scheduled",
        },
        report_answers: [{ field_id: "f", value: "공유 예시" }],
        report_attachments: [],
      },
      fields: [{ id: "f", field_type: "long_text", label: "수업 내용" }],
    },
  });
  render(await ReportPage({ params: Promise.resolve({ id, reportId }) }));
  expect(screen.getByText("공유 예시")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "수정" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /사진 추가|삭제|저장|제출/ }),
  ).not.toBeInTheDocument();
});
it("does not expose database errors or invalid params to the query", async () => {
  m.rpc.mockResolvedValue({ error: { message: "private database failure" } });
  await expect(Users({ searchParams })).rejects.toThrow(
    "사용자 목록을 불러오지 못했습니다",
  );
  expect(
    queryParams({ q: ["ignored"], page: "NaN", section: "__proto__" }),
  ).toEqual({ q: "", page: 1, section: "courses" });
  expect(queryParams({ q: "x".repeat(101), page: "-1" }).q).toHaveLength(100);
});
