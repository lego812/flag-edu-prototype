import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/auth/login-form", () => ({
  LoginForm: () => <div data-testid="login-form" />,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    } as never);
  });

  it("offers open email signup below password recovery", async () => {
    render(await LoginPage());
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "이메일로 회원가입" }),
    ).toHaveAttribute("href", "/signup?next=%2Fwelcome");
    expect(
      screen.getByRole("link", { name: "비밀번호를 잊으셨나요?" }),
    ).toHaveAttribute("href", "/forgot-password");
    expect(screen.queryByText(/회원가입은 관리자/)).not.toBeInTheDocument();
  });

  it("redirects authenticated users to the dashboard", async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1" } } }),
      },
    } as never);

    await LoginPage();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
});
