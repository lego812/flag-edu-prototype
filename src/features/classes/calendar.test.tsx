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
  has_time: true,
  status: "scheduled",
  ...overrides,
});

describe("ClassCalendar", () => {
  it("groups sessions by their Seoul date and links to details", () => {
    render(
      <ClassCalendar
        month="2026-10"
        sessions={[
          session("a", "2026-09-30T15:30:00.000Z"),
          session("b", "2026-10-15T03:00:00.000Z", { has_time: false }),
        ]}
      />,
    );

    expect(screen.getByRole("region", { name: "2026년 10월 수업 캘린더" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /수업 a/ })[0]).toHaveAttribute("href", "/classes/a");
    expect(screen.getAllByText("시간 미정").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "10월 1일" })).toBeInTheDocument();
  });

  it("exposes cancelled state in text", () => {
    render(
      <ClassCalendar
        month="2026-10"
        sessions={[session("cancelled", "2026-10-03T01:00:00.000Z", { status: "cancelled" })]}
      />,
    );

    expect(screen.getAllByText(/취소/).length).toBeGreaterThan(0);
  });
});
