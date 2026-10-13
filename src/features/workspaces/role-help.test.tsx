import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceRoleHelp } from "./role-help";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});
it("keeps guidance hidden until requested and restores focus after closing", () => {
  render(<WorkspaceRoleHelp />);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  const trigger = screen.getByRole("button", { name: "참여자 권한 안내" });
  fireEvent.click(trigger);
  expect(
    screen.getByRole("dialog", { name: "참여자 권한 안내" }),
  ).toHaveTextContent(
    "관리자는 수업·보고서·양식과 참여자를 관리하고, 코치는 수업 조회와 본인 보고서 작성·수정을 할 수 있습니다.",
  );
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
});
it("closes on the backdrop but keeps the popup open when its contents are clicked", () => {
  render(<WorkspaceRoleHelp />);
  fireEvent.click(screen.getByRole("button", { name: "참여자 권한 안내" }));
  fireEvent.click(screen.getByRole("heading", { name: "참여자 권한 안내" }));
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("dialog"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
