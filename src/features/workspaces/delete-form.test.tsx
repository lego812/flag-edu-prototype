import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock("./delete-actions", () => ({ deleteWorkspaceAction: m.action }));
import { DeleteWorkspaceForm } from "./delete-form";
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
function open() {
  render(<DeleteWorkspaceForm workspaceId="workspace" name="기관 A" />);
  fireEvent.click(screen.getByRole("button", { name: "워크스페이스 삭제" }));
  return screen.getByRole("dialog", { name: "워크스페이스 삭제 확인" });
}
it("enables deletion only for the exact name and cancel performs no action", () => {
  const dialog = open();
  const input = within(dialog).getByLabelText("워크스페이스 이름 확인");
  const confirm = within(dialog).getByRole("button", { name: "삭제 확인" });
  expect(confirm).toBeDisabled();
  for (const value of ["기관", "기관 a", "기관 A ", " 기관 A"]) {
    fireEvent.change(input, { target: { value } });
    expect(confirm).toBeDisabled();
  }
  fireEvent.change(input, { target: { value: "기관 A" } });
  expect(confirm).toBeEnabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(m.action).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "워크스페이스 삭제" }));
  expect(within(dialog).getByLabelText("워크스페이스 이름 확인")).toHaveValue(
    "",
  );
});
it("submits the typed name and keeps errors retryable", async () => {
  m.action.mockResolvedValue({ error: "삭제 실패" });
  const dialog = open();
  fireEvent.change(within(dialog).getByLabelText("워크스페이스 이름 확인"), {
    target: { value: "기관 A" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "삭제 확인" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "삭제 실패",
  );
  expect(m.action.mock.calls[0][1].get("confirmationName")).toBe("기관 A");
  expect(m.action.mock.calls[0][1].get("workspaceId")).toBe("workspace");
  expect(
    within(dialog).getByRole("button", { name: "삭제 확인" }),
  ).toBeEnabled();
});
it("blocks duplicate confirmation and dismissal during deletion", async () => {
  let resolve!: (v: { error: string }) => void;
  m.action.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const dialog = open();
  fireEvent.change(within(dialog).getByLabelText("워크스페이스 이름 확인"), {
    target: { value: "기관 A" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "삭제 확인" }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "삭제 중…" }),
    ).toBeDisabled(),
  );
  expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
  fireEvent.click(dialog);
  expect(dialog).toHaveAttribute("open");
  resolve({ error: "실패" });
  await within(dialog).findByRole("alert");
});
