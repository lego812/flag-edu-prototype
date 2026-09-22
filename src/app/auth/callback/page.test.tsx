import { StrictMode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ setSession: vi.fn(), exchangeCodeForSession: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: mocks }) }));
import Callback from "./page";
beforeEach(() => { vi.resetAllMocks(); mocks.setSession.mockResolvedValue({ error: null }); });
afterEach(cleanup);
it("accepts a link once in StrictMode and removes tokens from the address", async () => {
  window.history.replaceState(null, "", "/auth/callback#access_token=test&refresh_token=test");
  render(<StrictMode><Callback /></StrictMode>);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/set-password"));
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
  window.history.replaceState(null, "", "/auth/callback#error_description=Link+expired");
  render(<Callback />);
  expect(await screen.findByRole("alert")).toHaveTextContent("만료");
  expect(mocks.setSession).not.toHaveBeenCalled();
});
