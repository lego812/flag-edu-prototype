import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TemplateEditor } from "./editor";

vi.mock("./actions", () => ({ saveTemplateAction: vi.fn() }));

describe("template select option editor", () => {
  it("adds and removes options as distinct UI rows", () => {
    render(<TemplateEditor />);
    fireEvent.click(screen.getByRole("button", { name: "항목 추가" }));
    fireEvent.change(screen.getByLabelText("입력 유형"), {
      target: { value: "multi_select" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ 선택지 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "+ 선택지 추가" }));
    fireEvent.change(screen.getByLabelText("항목 1 선택지 1"), {
      target: { value: "축구" },
    });
    fireEvent.change(screen.getByLabelText("항목 1 선택지 2"), {
      target: { value: "농구" },
    });
    expect(screen.getByDisplayValue("축구")).toBeInTheDocument();
    expect(screen.getByDisplayValue("농구")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "선택지 1 삭제" }));
    expect(screen.queryByDisplayValue("축구")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("농구")).toBeInTheDocument();
  });
});
