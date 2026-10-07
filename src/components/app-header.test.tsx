import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";

vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("@/features/workspaces/actions", () => ({
  switchWorkspaceAction: vi.fn(),
}));
const route = vi.hoisted(() => ({ pathname: "/templates" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

const workspace = {
  id: "f8601730-c133-41b8-8d69-316edc982195",
  name: "기관 A",
  role: "admin" as const,
};
const workspaces = [workspace];

describe("AppHeader", () => {
  beforeEach(() => {
    route.pathname = "/templates";
  });
  it("shows only the logo at the left on home", () => {
    route.pathname = "/dashboard";
    const { container } = render(
      <AppHeader
        name="코치"
        isAdmin={false}
        workspace={workspace}
        workspaces={workspaces}
      />,
    );
    const logo = screen.getByRole("link", { name: "flag edu." });
    expect(logo).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "뒤로가기" }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("header > div")?.firstElementChild,
    ).toContainElement(logo);
  });
  it("replaces the logo with back when moving away from home", () => {
    route.pathname = "/dashboard";
    const { rerender, container } = render(
      <AppHeader
        name="코치"
        isAdmin={false}
        workspace={workspace}
        workspaces={workspaces}
      />,
    );
    route.pathname = "/reports/123";
    rerender(
      <AppHeader
        name="코치"
        isAdmin={false}
        workspace={workspace}
        workspaces={workspaces}
      />,
    );
    const back = screen.getByRole("button", { name: "뒤로가기" });
    expect(
      screen.queryByRole("link", { name: "flag edu." }),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector("header > div")?.firstElementChild,
    ).toContainElement(back);
  });
  it("keeps administrator navigation and logout accessible", () => {
    render(
      <AppHeader
        name="관리자"
        isAdmin
        workspace={workspace}
        workspaces={workspaces}
      />,
    );
    const navigation = within(
      screen.getByRole("navigation", { name: "주 메뉴" }),
    );
    expect(navigation.getByRole("link", { name: "수업" })).toHaveAttribute(
      "href",
      "/courses",
    );
    expect(navigation.getByRole("link", { name: "일정" })).toHaveAttribute(
      "href",
      "/classes",
    );
    expect(navigation.getByRole("link", { name: "관리" })).toHaveAttribute(
      "href",
      "/manage",
    );
    expect(navigation.getByRole("link", { name: "관리" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "로그아웃" })).toBeEnabled();
  });

  it("does not show administrator navigation to coaches", () => {
    render(
      <AppHeader
        name="코치"
        isAdmin={false}
        workspace={workspace}
        workspaces={workspaces}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "관리" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "수업" })).toBeInTheDocument();
  });
});
