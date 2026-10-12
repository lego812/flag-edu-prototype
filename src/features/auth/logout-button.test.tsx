import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ logout: vi.fn() }));
vi.mock("./actions", () => ({ logoutAction: m.logout }));
import { LogoutButton } from "./logout-button";
beforeEach(() => {
  vi.resetAllMocks();
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
it("asks before signout and lets cancel preserve the session", () => {
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  const dialog = screen.getByRole("dialog", { name: "로그아웃 확인" });
  expect(
    within(dialog).getByText("정말로 로그아웃하시겠습니까?"),
  ).toBeInTheDocument();
  expect(m.logout).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "취소" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(m.logout).not.toHaveBeenCalled();
});
it("submits only after confirmation and displays signout failure for retry", async () => {
  m.logout.mockResolvedValue({ error: "로그아웃 실패" });
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃" }));
  await waitFor(() => expect(m.logout).toHaveBeenCalledTimes(1));
  expect(m.logout.mock.calls[0][1].get("confirm")).toBe("yes");
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "로그아웃 실패",
  );
  expect(
    within(dialog).getByRole("button", { name: "로그아웃" }),
  ).toBeEnabled();
});
it("prevents duplicate confirmation and cancel while signing out", async () => {
  let resolve!: (v: { error: string }) => void;
  m.logout.mockImplementation(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  render(<LogoutButton />);
  fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃" }));
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "로그아웃 중…" }),
    ).toBeDisabled(),
  );
  expect(within(dialog).getByRole("button", { name: "취소" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "로그아웃 중…" }));
  expect(m.logout).toHaveBeenCalledTimes(1);
  resolve({ error: "실패" });
  await within(dialog).findByRole("alert");
});
