import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";

vi.mock("@/features/auth/actions", () => ({ logoutAction: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/templates",
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

describe("AppHeader", () => {
  it("keeps administrator navigation and logout accessible", () => {
    render(<AppHeader name="관리자" isAdmin />);
    const navigation = within(
      screen.getByRole("navigation", { name: "주 메뉴" }),
    );
    expect(navigation.getByRole("link", { name: "수업" })).toHaveAttribute(
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
    render(<AppHeader name="코치" isAdmin={false} />);
    expect(
      screen.queryByRole("link", { name: "관리" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "수업" })).toBeInTheDocument();
  });
});
