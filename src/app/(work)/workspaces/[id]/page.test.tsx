import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ current: vi.fn(), rpc: vi.fn() }));
vi.mock("@/features/auth/current-user", () => ({
  requireCurrentProfile: m.current,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));
vi.mock("@/features/workspaces/participant-actions", () => ({
  removeParticipantAction: vi.fn(),
}));
vi.mock("@/features/workspaces/rename-actions", () => ({
  renameWorkspaceAction: vi.fn(),
}));
vi.mock("@/features/members/actions", () => ({
  inviteCoachAction: vi.fn(),
  cancelInvitationAction: vi.fn(),
}));
vi.mock("@/features/members/manage-form", () => ({
  ManageMemberForm: () => <div>권한 편집</div>,
}));
import WorkspaceDetailPage from "./page";
const id = "20000000-0000-4000-8000-000000000001";
const self = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
function current(role = "coach", selected = id) {
  return {
    profile: { id: self, role: "coach" },
    workspace: { id: selected },
    workspaces: [{ id, name: "테스트 기관", role }],
    supabase: {
      rpc: m.rpc,
      from: () => ({
        select: () => ({
          eq: () => ({ order: async () => ({ data: [], error: null }) }),
        }),
      }),
    },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  m.current.mockResolvedValue(current());
  m.rpc.mockResolvedValue({
    data: [
      { user_id: self, name: "본인", role: "coach", status: "active" },
      { user_id: member, name: "참여자", role: "admin", status: "active" },
    ],
    error: null,
  });
});
it("coach sees target participants and roles without management controls", async () => {
  render(await WorkspaceDetailPage({ params: Promise.resolve({ id }) }));
  expect(
    screen.getByRole("heading", { name: "테스트 기관" }),
  ).toBeInTheDocument();
  expect(screen.getByText("참여자")).toBeInTheDocument();
  expect(screen.queryByText("워크스페이스 이름 변경")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "앱으로 초대" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("관리자 · 참여 중")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /내보내기/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "워크스페이스 나가기" }),
  ).toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledWith("list_workspace_participants", {
    p_workspace_id: id,
  });
});
it("target admin can remove others even with a different selected workspace", async () => {
  m.current.mockResolvedValue(current("admin", "other"));
  render(await WorkspaceDetailPage({ params: Promise.resolve({ id }) }));
  expect(
    screen.getByRole("button", { name: "참여자 내보내기" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "본인 내보내기" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "워크스페이스 나가기" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("권한·상태 변경")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "참여자 초대·보낸 초대 확인" }),
  ).not.toBeInTheDocument();
});
it("rejects malformed and foreign workspace routes before directory query", async () => {
  for (const target of ["bad", "20000000-0000-4000-8000-000000000099"])
    await expect(
      WorkspaceDetailPage({ params: Promise.resolve({ id: target }) }),
    ).rejects.toThrow("not found");
  expect(m.rpc).not.toHaveBeenCalled();
});
it("shows directory failures explicitly", async () => {
  m.rpc.mockResolvedValue({ error: { code: "42501" }, data: null });
  render(await WorkspaceDetailPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByRole("alert")).toHaveTextContent("참여자");
});

it("selected administrator sees invitations inside participants rather than a separate page link", async () => {
  m.current.mockResolvedValue(current("admin"));
  render(await WorkspaceDetailPage({ params: Promise.resolve({ id }) }));
  expect(screen.getByText("워크스페이스 이름 변경")).toBeInTheDocument();
  const panel = screen
    .getByRole("heading", { name: "참여자·권한" })
    .closest("section")!;
  expect(
    within(panel).getByRole("button", { name: "앱으로 초대" }),
  ).toBeInTheDocument();
  expect(
    within(panel).getByRole("heading", { name: "보낸 초대" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "참여자 초대·보낸 초대 확인" }),
  ).not.toBeInTheDocument();
  expect(panel.querySelector('input[name="workspaceId"]')).toHaveValue(id);
});
