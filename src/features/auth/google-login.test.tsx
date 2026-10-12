import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ signInWithOAuth: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: m }) }));
import { GoogleLogin } from "./google-login";
beforeEach(() => {
  vi.resetAllMocks();
});
it("starts only one Google PKCE flow with a fixed local callback", async () => {
  let resolve!: (v: { error: null }) => void;
  m.signInWithOAuth.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<GoogleLogin />);
  const b = screen.getByRole("button");
  fireEvent.click(b);
  fireEvent.click(b);
  expect(b).toBeDisabled();
  expect(m.signInWithOAuth).toHaveBeenCalledExactlyOnceWith({
    provider: "google",
    options: {
      redirectTo: window.location.origin + "/auth/callback?flow=google",
    },
  });
  resolve({ error: null });
});
it("shows OAuth initialization failure and permits retry without exposing backend details", async () => {
  m.signInWithOAuth.mockResolvedValue({
    error: new Error("private internal details"),
  });
  render(<GoogleLogin />);
  fireEvent.click(screen.getByRole("button"));
  expect(await screen.findByRole("alert")).not.toHaveTextContent(
    "private internal details",
  );
  await waitFor(() => expect(screen.getByRole("button")).toBeEnabled());
  m.signInWithOAuth.mockResolvedValue({ error: null });
  fireEvent.click(screen.getByRole("button"));
  expect(m.signInWithOAuth).toHaveBeenCalledTimes(2);
});
