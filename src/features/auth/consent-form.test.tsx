import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ action: vi.fn(), published: true }));
vi.mock("./consent-action", () => ({ acceptSignupConsentAction: m.action }));
vi.mock("./legal-policy", () => ({
  get SIGNUP_POLICY_PUBLISHED() {
    return m.published;
  },
  SIGNUP_POLICY_VERSION: "2026-10-12",
}));
import { SignupConsentForm } from "./consent-form";
beforeEach(() => {
  vi.resetAllMocks();
  m.published = true;
});
it("requires two initially unchecked mandatory choices, with readable documents and no marketing choice", () => {
  render(<SignupConsentForm />);
  const checks = screen.getAllByRole("checkbox");
  expect(checks).toHaveLength(2);
  for (const check of checks) {
    expect(check).not.toBeChecked();
    expect(check).toBeRequired();
  }
  const button = screen.getByRole("button", { name: "동의하고 가입 완료" });
  expect(button).toBeDisabled();
  fireEvent.click(checks[0]);
  expect(button).toBeDisabled();
  fireEvent.click(checks[1]);
  expect(button).toBeEnabled();
  expect(screen.getByRole("link", { name: /이용약관 보기/ })).toHaveAttribute(
    "target",
    "_blank",
  );
  expect(
    screen.getByRole("link", { name: /수집·이용 내용 보기/ }),
  ).toHaveAttribute("href", "/privacy#signup-consent");
  fireEvent.click(checks[0]);
  expect(button).toBeDisabled();
});
it("locks submission while saving, preserves choices on failure and permits retry", async () => {
  let finish!: (value: { error: string }) => void;
  m.action.mockImplementation(
    () =>
      new Promise((r) => {
        finish = r;
      }),
  );
  render(<SignupConsentForm />);
  for (const check of screen.getAllByRole("checkbox")) fireEvent.click(check);
  fireEvent.click(screen.getByRole("button", { name: "동의하고 가입 완료" }));
  await waitFor(() => expect(m.action).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "가입 완료 중…" })).toBeDisabled();
  for (const check of screen.getAllByRole("checkbox"))
    expect(check).toBeDisabled();
  finish({ error: "다시 시도해 주세요." });
  expect(await screen.findByRole("alert")).toHaveTextContent("다시 시도");
  for (const check of screen.getAllByRole("checkbox"))
    expect(check).toBeChecked();
  expect(
    screen.getByRole("button", { name: "동의하고 가입 완료" }),
  ).toBeEnabled();
});
it("never accepts draft documents", () => {
  m.published = false;
  render(<SignupConsentForm />);
  for (const check of screen.getAllByRole("checkbox")) fireEvent.click(check);
  expect(
    screen.getByRole("button", { name: "동의하고 가입 완료" }),
  ).toBeDisabled();
});
