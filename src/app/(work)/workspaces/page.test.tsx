import { render, screen } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), rpc: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("@/features/workspaces/create-form", () => ({
  CreateWorkspaceForm: () => <div>만들기</div>,
}));
vi.mock("@/features/workspaces/inbox-actions", () => ({
  respondInvitationAction: vi.fn(),
}));
import WorkspacesPage from "./page";
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue({
    profile: { role: "coach" },
    workspace: { id: "a" },
    workspaces: [{ id: "a", name: "현재 기관", role: "coach" }],
    supabase: { rpc: m.rpc },
  });
});
it("lets a recipient with a coach role view and accept invitations in workspaces", async () => {
  m.rpc.mockResolvedValue({
    data: [
      {
        id: "10000000-0000-4000-8000-000000000001",
        workspace_name: "새 초대 기관",
        expires_at: "2099-01-01T00:00:00Z",
      },
    ],
    error: null,
  });
  render(await WorkspacesPage());
  expect(
    screen.getByRole("heading", { name: "받은 초대" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "새 초대 기관" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "수락" })).toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith(
    "list_my_workspace_invitations",
  );
});
it("shows invitation fetch failure instead of a misleading empty inbox", async () => {
  m.rpc.mockResolvedValue({ data: null, error: { code: "failure" } });
  render(await WorkspacesPage());
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("받은 초대가 없습니다.")).not.toBeInTheDocument();
});
