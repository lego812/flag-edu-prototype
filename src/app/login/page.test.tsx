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

vi.mock("@/features/auth/google-login", () => ({
  GoogleLogin: () => <button>Google로 가입·로그인</button>,
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

  it("offers Google registration and retains legacy password login", async () => {
    render(await LoginPage());

    expect(screen.getByRole("heading", { name: "로그인" })).toBeInTheDocument();
    expect(screen.getByTestId("login-form")).toBeInTheDocument();
    const guidance = screen.getByText(
      "새 회원가입은 Google 계정으로 진행합니다. 워크스페이스 초대는 로그인 후 앱에서 확인하세요.",
    );
    const recovery = screen.getByRole("link", {
      name: "비밀번호를 잊으셨나요?",
    });
    expect(guidance).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Google로 가입·로그인" }),
    ).toBeInTheDocument();
    expect(
      recovery.compareDocumentPosition(guidance) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByTestId("login-form").compareDocumentPosition(recovery) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.queryByText("이미 비밀번호를 설정한 계정으로 로그인하세요."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("회원가입은 이메일 초대를 통해서만 가능합니다."),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("수업 기록을 더 간편하게"),
    ).not.toBeInTheDocument();
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
