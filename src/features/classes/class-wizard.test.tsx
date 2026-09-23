import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ClassWizard } from "./class-wizard";
vi.mock("./actions", () => ({
  createScheduleAction: vi.fn(),
  updateClassAction: vi.fn(),
}));
function start() {
  render(<ClassWizard />);
  fireEvent.change(screen.getByLabelText("수업명"), {
    target: { value: "체육 수업" },
  });
  fireEvent.change(screen.getByLabelText("장소 또는 기관명"), {
    target: { value: "센터" },
  });
  fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
}
describe("class registration wizard", () => {
  it("does not advance without required class information", () => {
    render(<ClassWizard />);
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByRole("alert")).toHaveTextContent("수업명");
  });
  it("shows weekdays only for weekly recurrence and leaves time optional", () => {
    start();
    fireEvent.change(screen.getByLabelText("반복"), {
      target: { value: "week" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByRole("checkbox", { name: "월" })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: "시간 설정 (선택)" }),
    ).not.toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "월" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "시간 설정 (선택)" }));
    expect(screen.getByLabelText("시작 시간")).toBeInTheDocument();
  });
  it("keeps repeat interval wheel buttons outside a label", () => {
    start();
    fireEvent.change(screen.getByLabelText("반복"), {
      target: { value: "day" },
    });
    const wheelButton = screen.getByRole("button", { name: "반복 간격" });
    expect(wheelButton.closest("label")).toBeNull();
    fireEvent.click(wheelButton);
    fireEvent.click(screen.getByRole("option", { name: "2" }));
    expect(wheelButton).toHaveTextContent("2");
  });
  it("daily recurrence does not request weekdays and retains data across steps", () => {
    start();
    fireEvent.change(screen.getByLabelText("반복"), {
      target: { value: "day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(
      screen.queryByRole("checkbox", { name: "월" }),
    ).not.toBeInTheDocument();
    const nextButton = screen.getByRole("button", { name: "다음 →" });
    fireEvent.click(nextButton);
    expect(screen.getByText("시간 미정")).toBeInTheDocument();
    expect(screen.getByText("STEP 4 / 4")).toBeInTheDocument();
    const submitButton = screen.getByRole("button", { name: /수업 등록/ });
    expect(submitButton).toBeInTheDocument();
    expect(submitButton).not.toBe(nextButton);
    expect(nextButton).not.toBeInTheDocument();
    expect(screen.getByText(/총 31개 수업/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByLabelText("수업명")).toHaveValue("체육 수업");
  });
  it("shows the end date for an overnight class before registration", () => {
    start();
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "시간 설정 (선택)" }),
    );
    fireEvent.change(screen.getByLabelText("수업 날짜"), {
      target: { value: "2026-09-23" },
    });
    fireEvent.change(screen.getByLabelText("시작 시간"), {
      target: { value: "23:00" },
    });
    fireEvent.change(screen.getByLabelText("종료 시간"), {
      target: { value: "01:00" },
    });
    fireEvent.change(
      screen.getByLabelText("종료 날짜 (다음 날 종료하는 경우 변경)"),
      { target: { value: "2026-09-24" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByText(/2026-09-24 01:00/)).toBeInTheDocument();
  });
});
