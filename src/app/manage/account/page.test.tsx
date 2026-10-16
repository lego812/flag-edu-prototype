vi.mock("@/features/master/access", () => ({
  masterAccount: async () => ({ isMaster: m.master }),
}));
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), master: false }));
vi.mock("@/features/auth/current-user", () => ({
  requireAccountWithWorkspaces: m.current,
}));
vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/app-header", () => ({
  AppHeader: () => <header>앱 메뉴</header>,
}));
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
it("keeps account information, logout and privacy contact available without any workspace", async () => {
  m.current.mockResolvedValue({
    user: {
      id: "own",
      email: "own@example.test",
      identities: [{ provider: "google" }],
    },
    profile: { name: "무소속", status: "inactive" },
    workspace: undefined,
    workspaces: [],
  });
  render(await AccountPage());
  expect(screen.getByText("own@example.test")).toBeInTheDocument();
  expect(
    screen.getByText("참여 중인 워크스페이스가 없습니다."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "로그아웃" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "시작 화면으로" })).toHaveAttribute(
    "href",
    "/welcome",
  );
  expect(
    screen.getByRole("link", { name: "davin990812@gmail.com" }),
  ).toHaveAttribute("href", "mailto:davin990812@gmail.com");
});

it("offers service navigation to a master with no workspace", async () => {
  m.master = true;
  m.current.mockResolvedValue({
    user: { email: "master@example.test", identities: [] },
    profile: { name: "운영자", status: "inactive" },
    workspaces: [],
  });
  render(await AccountPage());
  expect(screen.getByRole("link", { name: "사용자 관리" })).toHaveAttribute(
    "href",
    "/manage/users",
  );
  expect(
    screen.getByRole("link", { name: "전체 워크스페이스 조회" }),
  ).toHaveAttribute("href", "/manage/all-workspaces");
  m.master = false;
});
