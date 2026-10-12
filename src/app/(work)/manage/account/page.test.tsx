import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));
import AccountPage from "./page";
it("shows the coach's own account and workspace roles without requiring administrator access", async () => {
  m.current.mockResolvedValue({
    user: {
      email: "coach@example.test",
      identities: [{ provider: "google" }, { provider: "email" }],
      user_metadata: { access_token: "must-not-render" },
    },
    profile: { name: "본인", role: "coach" },
    workspace: { id: "b" },
    workspaces: [
      { id: "a", name: "기관 A", role: "admin" },
      { id: "b", name: "기관 B", role: "coach" },
    ],
  });
  const { container } = render(await AccountPage());
  expect(screen.getByText("coach@example.test")).toBeInTheDocument();
  expect(screen.getByText("Google, 이메일·비밀번호")).toBeInTheDocument();
  expect(screen.getByText("관리자")).toBeInTheDocument();
  expect(screen.getByText("코치")).toBeInTheDocument();
  expect(screen.getByText("현재")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  expect(container).not.toHaveTextContent("must-not-render");
});
