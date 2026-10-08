import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassCalendar } from "./calendar";
import type { ClassCalendarSession } from "./model";

const session = (
  id: string,
  start_at: string,
  overrides: Partial<ClassCalendarSession> = {},
): ClassCalendarSession => ({
  id,
  title: `수업 ${id}`,
  location: "배움터",
  start_at,
  end_at: start_at,
  has_time: true,
  status: "scheduled",
  created_by: "coach",
  ...overrides,
});

describe("ClassCalendar", () => {
  it("groups sessions by their Seoul date and links to details", () => {
    render(
      <ClassCalendar
        month="2026-10"
        selectedDate="2026-10-01"
        status="all"
        sessions={[
          session("a", "2026-09-30T15:30:00.000Z"),
          session("b", "2026-10-15T03:00:00.000Z", { has_time: false }),
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "2026년 10월 수업 캘린더" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /수업 a/ })[0]).toHaveAttribute("href", "/classes/a");
    expect(screen.queryByRole("link", { name: /수업 b/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /예정.*시간 미정/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "10월 1일 수업" })).toBeInTheDocument();
  });

  it("exposes cancelled state in text", () => {
    render(
      <ClassCalendar
        month="2026-10"
        selectedDate="2026-10-03"
        status="all"
        sessions={[session("cancelled", "2026-10-03T01:00:00.000Z", { status: "cancelled" })]}
      />,
    );

    expect(screen.getAllByText(/취소/).length).toBeGreaterThan(0);
  });

  it("shows completed sessions in green for the selected date", () => {
    render(
      <ClassCalendar
        month="2026-10"
        selectedDate="2026-10-04"
        status="completed"
        sessions={[
          session("done", "2026-10-04T01:00:00.000Z", {
            status: "completed",
          }),
        ]}
      />,
    );
    expect(screen.getByText("완료")).toHaveClass("bg-emerald-100");
  });

  it("highlights today with a distinct color", () => {
    render(
      <ClassCalendar
        month="2026-10"
        selectedDate="2026-10-01"
        status="all"
        sessions={[]}
        today="2026-10-08"
      />,
    );

    const todayLink = screen.getByRole("link", {
      name: "10월 8일, 오늘, 수업 0개",
    });
    expect(todayLink.parentElement).toHaveClass("bg-amber-100");
    expect(todayLink.firstElementChild).toHaveClass("bg-black", "text-white");
  });
});
