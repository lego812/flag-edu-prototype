import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Field, Report } from "./model";
import { ReportReader } from "./reader";

const field = (id: string, field_type: Field["field_type"], label = id): Field => ({
  id, label, field_type, help_text: null, required: false, sort_order: 0,
  settings: {}, field_options: [],
});
const report = (values: Record<string, unknown>): Report => ({
  id: "report", report_answers: Object.entries(values).map(([field_id, value]) => ({ field_id, value })),
}) as Report;

describe("report reading sheet", () => {
  it("keeps every field including photos in the referenced template order", () => {
    const fields = [field("before", "long_text"), field("photos", "photo"), field("after", "short_text")];
    const { container } = render(<ReportReader report={report({ before: "수업 내용", after: "추가 메모" })} fields={fields} attachments={[]} />);
    expect(Array.from(container.querySelectorAll("dt, h2")).map(node => node.textContent)).toEqual(["before", "photos", "after"]);
    expect(screen.getByText("첨부된 사진이 없습니다.")).toBeInTheDocument();
    expect(screen.queryByText("사진 추가")).not.toBeInTheDocument();
  });

  it("preserves numeric zero, newlines and semantic dates in compact rows", () => {
    const fields = [field("count", "number"), field("date", "date"), field("body", "long_text")];
    const { container } = render(<ReportReader report={report({ count: 0, date: "2026-10-07", body: "첫 줄\n둘째 줄" })} fields={fields} attachments={[]} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("2026.10.07")).toHaveAttribute("datetime", "2026-10-07");
    expect(container.querySelectorAll("dl")[0]).toHaveClass("grid");
    expect(container.querySelectorAll("dd")[2].textContent).toBe("첫 줄\n둘째 줄");
    expect(container.querySelectorAll("dd")[2]).toHaveClass("whitespace-pre-wrap");
  });

  it("renders single and multiple selections as ordered non-interactive chips", () => {
    render(<ReportReader report={report({ single: "체력", multiple: ["협동", "집중"] })} fields={[field("single", "single_select"), field("multiple", "multi_select")]} attachments={[]} />);
    expect(within(screen.getByRole("list", { name: "single 선택값" })).getByRole("listitem")).toHaveTextContent("체력");
    expect(within(screen.getByRole("list", { name: "multiple 선택값" })).getAllByRole("listitem").map(node => node.textContent)).toEqual(["협동", "집중"]);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("distinguishes missing/blank answers and empty selections from zero", () => {
    const fields = [field("missing", "short_text"), field("null", "long_text"), field("blank", "short_text"), field("spaces", "long_text"), field("empty", "multi_select"), field("zero", "number")];
    render(<ReportReader report={report({ null: null, blank: "", spaces: "  \n", empty: [], zero: 0 })} fields={fields} attachments={[]} />);
    expect(screen.getAllByText("미입력")).toHaveLength(5);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("allows long unbroken labels and answers to wrap without truncation or HTML execution", () => {
    const label = "긴항목명".repeat(30);
    const answer = "<script>alert('x')</script>" + "long".repeat(100);
    const { container } = render(<ReportReader report={report({ long: answer })} fields={[field("long", "long_text", label)]} attachments={[]} />);
    expect(screen.getByText(label)).toHaveClass("[overflow-wrap:anywhere]");
    expect(screen.getByText(answer)).toHaveClass("[overflow-wrap:anywhere]");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("dd")!.textContent).toBe(answer);
  });
});
