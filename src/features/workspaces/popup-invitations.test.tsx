import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({ rpc: vi.fn(), respond: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: m.rpc }),
}));
vi.mock("./inbox-actions", () => ({ respondInvitationAction: m.respond }));
import { PopupInvitations } from "./popup-invitations";
const invite = {
  id: "10000000-0000-4000-8000-000000000001",
  workspace_name: "초대된 워크스페이스",
  expires_at: "2099-01-01T00:00:00Z",
};
beforeEach(() => {
  vi.resetAllMocks();
  m.rpc.mockResolvedValue({ data: [invite], error: null });
  m.respond.mockResolvedValue({});
});
it("loads the recipient's invitation RPC and offers acceptance and decline", async () => {
  const { container } = render(<PopupInvitations />);
  expect(
    await screen.findByRole("heading", { name: invite.workspace_name }),
  ).toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledExactlyOnceWith(
    "list_my_workspace_invitations",
  );
  expect(screen.getByRole("button", { name: "수락" })).toHaveAttribute(
    "value",
    "accept",
  );
  expect(screen.getByRole("button", { name: "거절" })).toHaveAttribute(
    "value",
    "decline",
  );
  expect(container.querySelector('input[name="invitationId"]')).toHaveValue(
    invite.id,
  );
  expect(container.querySelector("form form")).toBeNull();
});
it("reports errors distinctly from an empty inbox and allows retry", async () => {
  m.rpc.mockRejectedValueOnce(Error("network"));
  render(<PopupInvitations />);
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("받은 초대가 없습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "초대 다시 불러오기" }));
  expect(
    await screen.findByRole("heading", { name: invite.workspace_name }),
  ).toBeInTheDocument();
  expect(m.rpc).toHaveBeenCalledTimes(2);
});
it("removes a declined invitation only after the server confirms success", async () => {
  render(<PopupInvitations />);
  await screen.findByRole("heading", { name: invite.workspace_name });
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  await waitFor(() => expect(m.respond).toHaveBeenCalledTimes(1));
  expect(m.respond.mock.calls[0][1].get("decision")).toBe("decline");
  expect(await screen.findByText("받은 초대가 없습니다.")).toBeInTheDocument();
});
it("keeps the invitation available when declining fails", async () => {
  m.respond.mockResolvedValue({ error: "수락 처리 실패" });
  render(<PopupInvitations />);
  await screen.findByRole("heading", { name: invite.workspace_name });
  fireEvent.click(screen.getByRole("button", { name: "거절" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("수락 처리 실패");
  expect(
    screen.getByRole("heading", { name: invite.workspace_name }),
  ).toBeInTheDocument();
});
it("does not apply a late response to a closed popup", async () => {
  let resolve!: (v: unknown) => void;
  m.rpc.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const { unmount } = render(<PopupInvitations />);
  unmount();
  resolve({ data: [invite], error: null });
  expect(m.rpc).toHaveBeenCalledTimes(1);
});
