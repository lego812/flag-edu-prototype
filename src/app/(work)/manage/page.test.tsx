import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
import ManagePage from "./page";
it("keeps account and workspace access for coaches without administrator report controls", async () => {
  m.current.mockResolvedValue({
    profile: { role: "coach" },
    workspace: { id: "workspace-id", name: "테스트" },
  });
  render(await ManagePage());
  expect(screen.getByRole("link", { name: /계정 관리/ })).toHaveAttribute(
    "href",
    "/manage/account",
  );
  expect(
    screen.getByRole("link", { name: /워크스페이스·참여자/ }),
  ).toHaveAttribute("href", "/workspaces");
  for (const name of [/전체 보고서/, /보고서 양식/, /보고서 다운로드/])
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
});
it("preserves administrator report management links", async () => {
  m.current.mockResolvedValue({
    profile: { role: "admin" },
    workspace: { id: "workspace-id", name: "테스트" },
  });
  render(await ManagePage());
  expect(screen.getByRole("link", { name: /계정 관리/ })).toHaveAttribute(
    "href",
    "/manage/account",
  );
  expect(screen.getByRole("link", { name: /전체 보고서/ })).toHaveAttribute(
    "href",
    "/admin-reports",
  );
  expect(screen.getByRole("link", { name: /보고서 양식/ })).toHaveAttribute(
    "href",
    "/workspaces/workspace-id/templates",
  );
  expect(screen.getByRole("link", { name: /보고서 다운로드/ })).toHaveAttribute(
    "href",
    "/exports",
  );
});
