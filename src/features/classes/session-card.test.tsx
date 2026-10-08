import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassSessionCard, ClassStatusBadge } from "./session-card";
import type { ClassCalendarSession } from "./model";

describe("class status colors", () => {
  it.each([
    ["scheduled", "예정", "bg-amber-100"],
    ["cancelled", "취소", "bg-red-100"],
    ["completed", "완료", "bg-emerald-100"],
  ] as const)("maps %s to the required label and color", (status, label, color) => {
    render(<ClassStatusBadge status={status} />);
    expect(screen.getByText(label)).toHaveClass(color);
  });
});

const session: ClassCalendarSession = {
  id: "class-1",
  title: "테스트 수업",
  location: "체육관",
  start_at: "2026-10-08T09:00:00+09:00",
  end_at: "2026-10-08T10:00:00+09:00",
  has_time: true,
  teaching_method: "준비 운동 후 팀별 활동",
  status: "scheduled",
  created_by: "coach",
};

describe("ClassSessionCard", () => {
  it("shows the teaching method in a single truncated line", () => {
    render(<ClassSessionCard session={session} />);

    expect(screen.getByText("수업 진행방식").parentElement).toHaveClass(
      "truncate",
    );
    expect(screen.getByText("준비 운동 후 팀별 활동")).toBeInTheDocument();
  });

  it("does not render an empty teaching method row", () => {
    render(
      <ClassSessionCard
        session={{ ...session, teaching_method: "   " }}
      />,
    );

    expect(screen.queryByText("수업 진행방식")).not.toBeInTheDocument();
  });
});
