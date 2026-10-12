import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("./participant-actions", () => ({ removeParticipantAction: m.action }));
import { RemoveParticipantForm } from "./remove-participant-form";
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
it("uses leave wording throughout the self dialog and cancel preserves participation", () => {
  render(
    <RemoveParticipantForm
      workspaceId="workspace"
      userId="self"
      name="본인"
      self
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "워크스페이스 나가기" }));
  const dialog = screen.getByRole("dialog", {
    name: "워크스페이스 나가기 확인",
  });
  expect(
    within(dialog).getByText("워크스페이스에서 나갈까요?"),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "나가기 확인" }),
  ).toBeInTheDocument();
  expect(dialog).toHaveTextContent("다른 워크스페이스 참여는 유지");
  expect(dialog).not.toHaveTextContent("내보내기");
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(m.action).not.toHaveBeenCalled();
});
it("preserves remove wording for another participant", () => {
  render(
    <RemoveParticipantForm
      workspaceId="workspace"
      userId="other"
      name="참여자"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "참여자 내보내기" }));
  const dialog = screen.getByRole("dialog", { name: "참여자 내보내기 확인" });
  expect(
    within(dialog).getByRole("button", { name: "내보내기 확인" }),
  ).toBeInTheDocument();
  expect(dialog).not.toHaveTextContent("나가기");
});
