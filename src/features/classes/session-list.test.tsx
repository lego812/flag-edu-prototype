import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClassSessionList } from "./session-list";
import type { ClassCalendarSession } from "./model";
const session = (id: string, start_at: string, extra: Partial<ClassCalendarSession> = {}): ClassCalendarSession => ({id, title: `수업 ${id}`, location: "배움터", start_at, end_at: start_at, status: "scheduled", created_by: "coach", ...extra});
describe("date-grouped class list", () => {
  it("groups by Seoul date while retaining query order and detail links", () => {
    render(<ClassSessionList sessions={[
      session("a", "2026-10-03T15:30:00Z"),
      session("b", "2026-10-03T23:00:00Z", { status: "cancelled", has_time: false }),
      session("c", "2026-10-02T06:30:00Z", { status: "completed" }),
    ]} />);
    expect(screen.getAllByRole("heading", { level: 2 }).map(h => h.textContent)).toEqual(["10월 4일", "10월 2일"]);
    const day = screen.getByRole("heading", { name: "10월 4일" }).closest("li")!;
    expect(within(day).getAllByRole("link")).toHaveLength(2);
    expect(within(day).getByRole("link", {name: /수업 a/})).toHaveAttribute("href", "/classes/a");
    expect(within(day).getByText("예정 · 00:30")).toBeInTheDocument();
    expect(within(day).getByText("취소 · 시간 미정")).toBeInTheDocument();
    expect(screen.getByText("완료 · 15:30")).toBeInTheDocument();
  });
  it("keeps equal month/day dates from different years separate", () => {
    render(<ClassSessionList sessions={[session("a", "2026-10-04T00:00:00Z"), session("b", "2025-10-04T00:00:00Z")]} />);
    expect(screen.getAllByRole("heading", {level: 2})).toHaveLength(2);
    expect(document.querySelectorAll('time[datetime="2026-10-04"]')).toHaveLength(1);
    expect(document.querySelectorAll('time[datetime="2025-10-04"]')).toHaveLength(1);
  });
});
