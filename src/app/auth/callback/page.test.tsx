import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  setSession: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  accept: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: mocks }),
}));
vi.mock("@/features/workspaces/invitation-actions", () => ({
  finishInvitationAuthentication: mocks.accept,
}));
import Callback from "./page";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.setSession.mockResolvedValue({ error: null });
});
afterEach(cleanup);
it("accepts a link once in StrictMode and removes tokens from the address", async () => {
  window.history.replaceState(
    null,
    "",
    "/auth/callback#access_token=test&refresh_token=test",
  );
  render(
    <StrictMode>
      <Callback />
    </StrictMode>,
  );
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith("/set-password"),
  );
  expect(mocks.setSession).toHaveBeenCalledTimes(1);
  expect(window.location.hash).toBe("");
});
it("does not treat an existing session as a valid invitation", async () => {
  window.history.replaceState(null, "", "/auth/callback");
  render(<Callback />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});
it("shows expiration without exchanging credentials", async () => {
  window.history.replaceState(
    null,
    "",
    "/auth/callback#error_description=Link+expired",
  );
  render(<Callback />);
  expect(await screen.findByRole("alert")).toHaveTextContent("만료");
  expect(mocks.setSession).not.toHaveBeenCalled();
});

it("preserves the signup destination and rejects external next URLs", async () => {
  mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
  window.history.replaceState(
    null,
    "",
    "/auth/callback?code=example&next=%2Fwelcome",
  );
  const ui = render(<Callback />);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/welcome"));
  ui.unmount();
  mocks.replace.mockClear();
  window.history.replaceState(
    null,
    "",
    "/auth/callback?code=example&next=https%3A%2F%2Fattacker.example",
  );
  render(<Callback />);
  await waitFor(() =>
    expect(mocks.replace).toHaveBeenCalledWith("/set-password"),
  );
});
it("accepts only the particular workspace invitation after credentials exchange", async () => {
  const token = "a".repeat(64);
  mocks.accept.mockResolvedValue({ next: "/dashboard" });
  window.history.replaceState(
    null,
    "",
    `/auth/callback?next=%2Finvitations%2F${token}#access_token=test&refresh_token=test`,
  );
  render(<Callback />);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/dashboard"));
  expect(mocks.accept).toHaveBeenCalledWith(token);
  expect(mocks.setSession).toHaveBeenCalledTimes(1);
});
it("does not accept or redirect if exchanging email credentials fails", async () => {
  mocks.setSession.mockResolvedValue({ error: new Error("expired") });
  window.history.replaceState(
    null,
    "",
    `/auth/callback?next=%2Finvitations%2F${"a".repeat(64)}#access_token=test&refresh_token=test`,
  );
  render(<Callback />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(mocks.accept).not.toHaveBeenCalled();
  expect(mocks.replace).not.toHaveBeenCalled();
});
