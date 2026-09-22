import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportPage from "./page";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), report: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: mocks.auth,
}));
vi.mock("@/features/reports/repository", () => ({
  getReport: mocks.report,
  getTemplate: async () => ({
    template_fields: [{ id: "field", label: "내용", field_type: "long_text" }],
  }),
}));
vi.mock("@/features/reports/editor", () => ({
  ReportEditor: () => <textarea aria-label="보고서 편집" />,
}));
vi.mock("@/features/reports/photos", () => ({
  Photos: ({ editable }: { editable: boolean }) => (
    <div>{editable ? "사진 편집" : "사진 조회"}</div>
  ),
}));
const id = "10000000-0000-4000-8000-000000000001";
describe("report read/edit mode", () => {
  beforeEach(() => {
    mocks.auth.mockResolvedValue({
      profile: { id: "owner", role: "admin" },
      supabase: {},
    });
    mocks.report.mockResolvedValue({
      data: {
        id,
        author_id: "owner",
        template_version_id: "template",
        profiles: { name: "홍길동" },
        created_at: "2026-09-23T00:00:00Z",
        class_sessions: { title: "체육", status: "scheduled" },
        report_attachments: [],
        report_answers: [{ field_id: "field", value: "수업 기록" }],
      },
    });
  });
  it("opens the owner's report read-only by default", async () => {
    render(
      await ReportPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("수업 기록")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "수정" })).toHaveAttribute(
      "href",
      `/reports/${id}?edit=1`,
    );
    expect(screen.getByText("사진 조회")).toBeInTheDocument();
    expect(screen.queryByText("관리자 확인 완료")).not.toBeInTheDocument();
  });
  it("only enables editing for the author with the edit flag", async () => {
    render(
      await ReportPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({ edit: "1" }),
      }),
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByText("사진 편집")).toBeInTheDocument();
  });
  it("does not let another user edit by changing the URL", async () => {
    mocks.auth.mockResolvedValue({
      profile: { id: "someone-else", role: "admin" },
      supabase: {},
    });
    render(
      await ReportPage({
        params: Promise.resolve({ id }),
        searchParams: Promise.resolve({ edit: "1" }),
      }),
    );
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "수정" }),
    ).not.toBeInTheDocument();
  });
});
