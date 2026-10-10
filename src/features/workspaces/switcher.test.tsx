import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./switcher";
vi.mock("./actions", () => ({
  switchWorkspaceAction: vi.fn(),
  switchWorkspaceInPopupAction: vi.fn(),
}));
const current = {
  id: "f8601730-c133-41b8-8d69-316edc982195",
  name: "기관 A",
  role: "admin" as const,
};
const other = {
  ...current,
  id: "b91c4416-12ea-49e8-b061-82f9f4f9eb11",
  name: "기관 B",
  role: "coach" as const,
};
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
describe("WorkspaceSwitcher popup", () => {
  it("opens a popup even for a single workspace and offers creation", () => {
    render(<WorkspaceSwitcher current={current} workspaces={[current]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "워크스페이스 변경: 기관 A" }),
    );
    const popup = screen.getByRole("dialog", { name: "워크스페이스 변경" });
    expect(
      within(popup).getByText("현재 사용 중 · 관리자"),
    ).toBeInTheDocument();
    expect(
      within(popup).getByRole("link", { name: "새 워크스페이스 만들기" }),
    ).toHaveAttribute("href", "/workspaces");
  });
  it("offers active memberships in the popup and sends only the chosen id", () => {
    render(
      <WorkspaceSwitcher current={current} workspaces={[current, other]} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "워크스페이스 변경: 기관 A" }),
    );
    const button = screen.getByRole("button", { name: "기관 B 코치" });
    expect(button).toHaveAttribute("name", "workspaceId");
    expect(button).toHaveValue(other.id);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
  it("closes after the server confirms a workspace change", () => {
    const { rerender } = render(
      <WorkspaceSwitcher current={current} workspaces={[current, other]} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "워크스페이스 변경: 기관 A" }),
    );
    rerender(
      <WorkspaceSwitcher current={other} workspaces={[current, other]} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "워크스페이스 변경: 기관 B" }),
    ).toBeVisible();
  });
  it("closes with its button or backdrop and restores trigger focus", () => {
    render(<WorkspaceSwitcher current={current} workspaces={[current]} />);
    const trigger = screen.getByRole("button", {
      name: "워크스페이스 변경: 기관 A",
    });
    fireEvent.click(trigger);
    fireEvent.click(
      screen.getByRole("button", { name: "워크스페이스 팝업 닫기" }),
    );
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
