import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceSwitcher } from "./switcher";

vi.mock("./actions", () => ({ switchWorkspaceAction: vi.fn() }));

const current = {
  id: "f8601730-c133-41b8-8d69-316edc982195",
  name: "기관 A",
  role: "admin" as const,
};

describe("WorkspaceSwitcher", () => {
  it("shows a label when the account belongs to one workspace", () => {
    render(<WorkspaceSwitcher current={current} workspaces={[current]} />);
    expect(screen.getByLabelText("현재 워크스페이스 기관 A")).toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("offers all active workspaces when there is more than one", () => {
    render(
      <WorkspaceSwitcher
        current={current}
        workspaces={[
          current,
          {
            id: "b91c4416-12ea-49e8-b061-82f9f4f9eb11",
            name: "기관 B",
            role: "coach",
          },
        ]}
      />,
    );
    expect(screen.getByRole("combobox", { name: "워크스페이스" })).toHaveValue(
      current.id,
    );
    expect(screen.getByRole("option", { name: "기관 B" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "전환" })).toBeEnabled();
  });

  it("updates the selected option after a server-confirmed workspace change", () => {
    const other = { ...current, id: "b91c4416-12ea-49e8-b061-82f9f4f9eb11", name: "기관 B" };
    const workspaces = [current, other];
    const { rerender } = render(<WorkspaceSwitcher current={current} workspaces={workspaces} />);
    rerender(<WorkspaceSwitcher current={other} workspaces={workspaces} />);
    expect(screen.getByRole("combobox", { name: "워크스페이스" })).toHaveValue(other.id);
  });
});
