import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import FeedbackLink from "./feedback-link";
const state = vi.hoisted(() => ({ pending: false }));
vi.mock("next/link", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/link")>(),
  useLinkStatus: () => ({ pending: state.pending }),
}));
it("shows and clears navigation feedback while retaining link names and attributes", () => {
  state.pending = false;
  const ui = render(<FeedbackLink href="/classes?view=list" className="btn" target="_self">수업 일정</FeedbackLink>);
  const link = screen.getByRole("link", { name: "수업 일정" });
  expect(link).toHaveAttribute("href", "/classes?view=list");
  expect(link).toHaveAttribute("target", "_self");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  state.pending = true;
  ui.rerender(<FeedbackLink href="/classes?view=list" className="btn">수업 일정</FeedbackLink>);
  expect(screen.getByRole("link", { name: "수업 일정" })).toBeInTheDocument();
  expect(screen.getByRole("status", { name: "페이지 이동 중" })).toBeInTheDocument();
  state.pending = false;
  ui.rerender(<FeedbackLink href="/classes?view=list">수업 일정</FeedbackLink>);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
