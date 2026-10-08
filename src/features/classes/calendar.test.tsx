import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ClassCalendar } from "./calendar";
import type { ClassCalendarSession } from "./model";

vi.mock("next/link", () => ({
  default: ({ scroll, ...props }: ComponentProps<"a"> & { scroll?: boolean }) => (
    <a data-scroll={String(scroll)} {...props} />
  ),
}));

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
  it("pairs each status dot with its own count on a mixed-status date", () => {
    render(
      <ClassCalendar month="2026-10" selectedDate="2026-10-01" status="all" sessions={[
        session("cancelled", "2026-10-31T01:00:00.000Z", { status: "cancelled" }),
        session("done-1", "2026-10-31T02:00:00.000Z", { status: "completed" }),
        session("done-2", "2026-10-31T03:00:00.000Z", { status: "completed" }),
      ]} />,
    );
    const date = screen.getByRole("link", { name: "10월 31일, 수업 3개" });
    const counts = within(date).getAllByRole("img");
    expect(counts.map((element) => element.getAttribute("aria-label"))).toEqual(["완료 2개", "취소 1개"]);
    expect(counts[0]).toHaveTextContent("2");
    expect(counts[0].firstElementChild).toHaveClass("bg-emerald-500");
    expect(counts[1]).toHaveTextContent("1");
    expect(counts[1].firstElementChild).toHaveClass("bg-red-500");
  });

  it("counts every session without truncating or mixing dates", () => {
    render(
      <ClassCalendar month="2026-10" selectedDate="2026-10-01" status="all" sessions={[
        ...Array.from({ length: 5 }, (_, index) => session(`scheduled-${index}`, "2026-10-31T01:00:00.000Z")),
        session("done", "2026-10-31T02:00:00.000Z", { status: "completed" }),
        session("other-day", "2026-10-30T02:00:00.000Z", { status: "cancelled" }),
      ]} />,
    );
    const date = screen.getByRole("link", { name: "10월 31일, 수업 6개" });
    expect(within(date).getAllByRole("img")).toHaveLength(2);
    expect(within(date).getByRole("img", { name: "예정 5개" }).firstElementChild).toHaveClass("bg-amber-400");
    expect(within(date).getByRole("img", { name: "완료 1개" })).toHaveTextContent("1");
    expect(within(date).queryByRole("img", { name: /취소/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole("link", { name: "10월 29일, 수업 0개" })).queryByRole("img")).not.toBeInTheDocument();
  });

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

  it("keeps the current scroll position when selecting a date", () => {
    render(
      <ClassCalendar
        month="2026-10"
        selectedDate="2026-10-01"
        status="all"
        sessions={[]}
        today="2026-10-08"
      />,
    );

    expect(screen.getByRole("link", { name: "10월 8일, 오늘, 수업 0개" })).toHaveAttribute(
      "data-scroll",
      "false",
    );
  });
});
