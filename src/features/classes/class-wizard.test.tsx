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
  it("daily recurrence does not request weekdays and retains data across steps", () => {
    start();
    fireEvent.change(screen.getByLabelText("반복"), {
      target: { value: "day" },
    });
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(
      screen.queryByRole("checkbox", { name: "월" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 →" }));
    expect(screen.getByText("시간 미정")).toBeInTheDocument();
    expect(screen.getByText("STEP 4 / 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /수업 등록/ })).toBeInTheDocument();
    expect(screen.getByText(/총 31개 수업/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    expect(screen.getByLabelText("수업명")).toHaveValue("체육 수업");
  });
});
