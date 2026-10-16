import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ReportList } from "./list";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), summaries: vi.fn(), authors: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({ requireCurrentProfile: mocks.auth }));
vi.mock("./repository", async (original) => ({
  ...await original<typeof import("./repository")>(),
  listReportSummaries: mocks.summaries,
  listReportAuthors: mocks.authors,
}));
vi.mock("@/features/classes/search-picker", () => ({ ClassSearchPicker: () => null }));
vi.mock("@/components/list-filters", () => ({ ListFilters: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/filter-form", () => ({ FilterForm: ({ children, action }: { children: React.ReactNode; action: string }) => <form action={action}>{children}</form> }));
const coach = "10000000-0000-4000-8000-000000000001";
const peer = "10000000-0000-4000-8000-000000000002";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ supabase: {}, profile: { id: coach, organization_id: "workspace", role: "coach" } });
  mocks.summaries.mockResolvedValue({ data: [], error: null, count: 25 });
  mocks.authors.mockResolvedValue({ data: [{ id: peer, name: "다른 코치" }], error: null });
});
it("keeps the default list restricted to the author even with a forged author filter", async () => {
  render(await ReportList({ params: { author: peer } }));
  expect(mocks.summaries).toHaveBeenCalledWith({}, "workspace", expect.anything(), coach);
  expect(mocks.authors).not.toHaveBeenCalled();
  expect(screen.getByRole("link", { name: "워크스페이스 보고서" })).toHaveAttribute("href", "/reports?scope=workspace");
});
it("shares reports with author filters and preserves scope on filtering and pagination", async () => {
  render(await ReportList({ params: { scope: "workspace", author: peer } }));
  expect(mocks.summaries).toHaveBeenCalledWith({}, "workspace", expect.objectContaining({ author: peer }), undefined);
  expect(screen.getByRole("combobox", { name: "작성자" })).toHaveValue(peer);
  expect(document.querySelector('input[name="scope"]')).toHaveValue("workspace");
  expect(screen.getByRole("link", { name: "다음" }).getAttribute("href")).toContain("scope=workspace");
  expect(screen.getByText(/다른 사람이 작성한 보고서는 수정할 수 없습니다/)).toBeInTheDocument();
});
it("preserves shared scope when resetting invalid filters", async () => {
  render(await ReportList({ params: { scope: "workspace", page: "bad" } }));
  expect(screen.getByRole("link", { name: "조건 초기화" })).toHaveAttribute("href", "/reports?scope=workspace");
  expect(mocks.summaries).not.toHaveBeenCalled();
});
it("reports author lookup failures instead of silently showing an empty author list", async () => {
  mocks.authors.mockResolvedValue({ data: null, error: { message: "network" } });
  await expect(ReportList({ params: { scope: "workspace" } })).rejects.toThrow("보고서 작성자 조회 실패");
});
