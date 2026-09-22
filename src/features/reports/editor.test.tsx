import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportEditor } from "./editor";
import type { Report } from "./model";

const mocks = vi.hoisted(() => ({ push: vi.fn(), save: vi.fn() }));
const router = { push: mocks.push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({ saveReportAction: mocks.save }));
const report = {
  id: "report-id",
  updated_at: "2026-09-22T00:00:00Z",
  status: "draft",
  report_answers: [],
  class_sessions: { status: "scheduled" },
} as unknown as Report;

describe("ReportEditor navigation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves for the report list after successful submission", async () => {
    mocks.save.mockResolvedValue({
      success: "제출했습니다.",
      redirectTo: "/reports",
    });
    render(<ReportEditor report={report} fields={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/reports"));
    expect(mocks.save.mock.calls[0][2].get("intent")).toBe("submit");
  });

  it("stays on the editor if submission fails", async () => {
    mocks.save.mockResolvedValue({ error: "저장하지 못했습니다." });
    render(<ReportEditor report={report} fields={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "제출" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "저장하지 못했습니다.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("stays on the editor after saving a draft", async () => {
    mocks.save.mockResolvedValue({ success: "저장했습니다." });
    render(<ReportEditor report={report} fields={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "저장했습니다.",
    );
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
