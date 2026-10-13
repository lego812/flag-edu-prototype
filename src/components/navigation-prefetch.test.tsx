import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import FeedbackLink from "./feedback-link";
import { canPrefetchList } from "./navigation-prefetch";
import nextConfig from "../../next.config";

vi.mock("next/link", () => ({
  default: ({ prefetch, onNavigate: _onNavigate, ...props }: ComponentProps<"a"> & { prefetch?: boolean; onNavigate?: unknown }) => {
    void _onNavigate;
    return <a {...props} data-prefetch={String(prefetch)} />;
  },
  useLinkStatus: () => ({ pending: false }),
}));

it("restricts full prefetch to read-only lists with explicit class views and limits reuse to 30 seconds", () => {
  for (const href of ["/reports", "/admin-reports?page=2", "/courses", "/dashboard", "/classes?view=list", "/classes?view=calendar&month=2026-10"])
    expect(canPrefetchList(href)).toBe(true);
  for (const href of ["/reports/id", "/classes/new", "/classes", "/classes?view=bad", "/login", "/manage/account", "//external/reports", "https://external/reports"])
    expect(canPrefetchList(href)).toBe(false);
  expect(nextConfig.experimental?.staleTimes).toEqual({ dynamic: 0, static: 30 });
});

it.each(["mouseEnter", "focus", "touchStart"] as const)("waits for %s intent before fetching a full list", (event) => {
  render(<FeedbackLink href="/reports">보고서</FeedbackLink>);
  const link = screen.getByRole("link");
  expect(link).toHaveAttribute("data-prefetch", "false");
  fireEvent[event](link);
  expect(link).toHaveAttribute("data-prefetch", "true");
});

it("resets intent when filters change and respects explicit prefetch opt-out", () => {
  const ui = render(<FeedbackLink href="/reports?page=1">Reports</FeedbackLink>);
  fireEvent.focus(screen.getByRole("link"));
  ui.rerender(<FeedbackLink href="/reports?page=2">Reports</FeedbackLink>);
  expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
  ui.rerender(<FeedbackLink href="/reports" prefetch={false}>Reports</FeedbackLink>);
  fireEvent.touchStart(screen.getByRole("link"));
  expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
});

it("preserves caller events and does not prefetch when they cancel intent", () => {
  const focus = vi.fn((event: React.FocusEvent) => event.preventDefault());
  render(<FeedbackLink href="/reports" onFocus={focus}>Reports</FeedbackLink>);
  fireEvent.focus(screen.getByRole("link"));
  expect(focus).toHaveBeenCalledOnce();
  expect(screen.getByRole("link")).toHaveAttribute("data-prefetch", "false");
});
