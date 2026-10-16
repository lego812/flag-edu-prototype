vi.mock("@/features/master/access", () => ({
  masterAccount: async () => ({ isMaster: m.master }),
}));
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), master: false }));
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
  expect(screen.getByRole("link", { name: /고객센터/ })).toHaveAttribute(
    "href",
    "/manage/support",
  );
  expect(screen.getByRole("link", { name: /계정 관리/ })).toHaveAttribute(
    "href",
    "/manage/account",
  );
  expect(
    screen.getByRole("link", { name: /워크스페이스·참여자/ }),
  ).toHaveAttribute("href", "/workspaces");
  for (const name of [
    /전체 보고서/,
    /보고서 양식/,
    /보고서 다운로드/,
    /사용자 관리/,
    /전체 워크스페이스/,
  ])
    expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
});
it("preserves administrator report management links", async () => {
  m.current.mockResolvedValue({
    profile: { role: "admin" },
    workspace: { id: "workspace-id", name: "테스트" },
  });
  render(await ManagePage());
  expect(screen.getByRole("link", { name: /고객센터/ })).toHaveAttribute(
    "href",
    "/manage/support",
  );
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

it("adds read-only service links only for a master without promoting the workspace role", async () => {
  m.master = true;
  m.current.mockResolvedValue({
    profile: { role: "coach" },
    workspace: { id: "workspace-id", name: "테스트" },
  });
  render(await ManagePage());
  expect(screen.getByRole("link", { name: /고객센터/ })).toHaveAttribute(
    "href",
    "/manage/support",
  );
  expect(screen.getByRole("link", { name: /사용자 관리/ })).toHaveAttribute(
    "href",
    "/manage/users",
  );
  expect(
    screen.getByRole("link", { name: /전체 워크스페이스/ }),
  ).toHaveAttribute("href", "/manage/all-workspaces");
  expect(
    screen.queryByRole("link", { name: /보고서 양식/ }),
  ).not.toBeInTheDocument();
  m.master = false;
});
