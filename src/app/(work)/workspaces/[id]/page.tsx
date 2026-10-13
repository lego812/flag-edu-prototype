import Link from "@/components/feedback-link";
import { notFound } from "next/navigation";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { isUuid } from "@/features/classes/model";
import { RemoveParticipantForm } from "@/features/workspaces/remove-participant-form";
import { RenameWorkspaceForm } from "@/features/workspaces/rename-form";
import { WorkspaceInvitationPanel } from "@/features/workspaces/invitation-panel";
import { DeleteWorkspaceForm } from "@/features/workspaces/delete-form";
import { ManageMemberForm } from "@/features/members/manage-form";
import { WorkspaceRoleHelp } from "@/features/workspaces/role-help";

export const metadata = { title: "워크스페이스 참여자" };
export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, profile, workspace, workspaces } =
    await requireCurrentProfile();
  const target = workspaces.find((w) => w.id === id);
  if (!target) notFound();
  const { data: members, error } = await supabase.rpc(
    "list_workspace_participants",
    { p_workspace_id: id },
  );
  const inviteResult =
    target.role === "admin" && target.id === workspace.id
      ? await supabase
          .from("workspace_invitations")
          .select("id,email,status,expires_at")
          .eq("organization_id", id)
          .order("created_at", { ascending: false })
      : null;
  return (
    <div className="space-y-8">
      <header>
        <Link href="/workspaces" className="text-sm underline">
          워크스페이스 목록
        </Link>
        <h1 className="mt-3 break-words text-3xl font-bold">{target.name}</h1>
        <p className="mt-3 text-sm text-neutral-600">
          내 권한: {target.role === "admin" ? "관리자" : "코치"}
        </p>
      </header>
      {target.role === "admin" && (
        <RenameWorkspaceForm
          key={`rename:${target.name}`}
          workspaceId={id}
          name={target.name}
        />
      )}
      <section id="participants" className="surface p-6">
        <div className="mb-4 flex items-center gap-1">
          <h2 className="font-bold">참여자·권한</h2>
          <WorkspaceRoleHelp />
        </div>
        {error ? (
          <p role="alert">참여자를 불러오지 못했습니다. 새로고침해 주세요.</p>
        ) : (
          <ul className="divide-y divide-neutral-100">
            {members
              ?.filter((m: { status: string }) => m.status !== "inactive")
              .map(
                (m: {
                  user_id: string;
                  name: string;
                  role: string;
                  status: string;
                }) => (
                  <li
                    key={m.user_id}
                    className="flex flex-wrap items-center justify-between gap-3 py-4"
                  >
                    <span className="min-w-0 break-words font-medium">
                      {m.name}
                      {m.user_id === profile.id && (
                        <span className="ml-2 text-xs text-neutral-500">
                          나
                        </span>
                      )}
                    </span>
                    <span className="text-sm">
                      {m.role === "admin" ? "관리자" : "코치"} ·{" "}
                      {m.status === "active"
                        ? "참여 중"
                        : m.status === "pending"
                          ? "대기"
                          : "참여 해제"}
                    </span>
                    {m.status === "active" &&
                      (m.user_id === profile.id || target.role === "admin") && (
                        <RemoveParticipantForm
                          workspaceId={id}
                          userId={m.user_id}
                          name={m.name}
                          self={m.user_id === profile.id}
                        />
                      )}
                    {target.role === "admin" &&
                      target.id === workspace.id &&
                      m.status !== "pending" && (
                        <details className="w-full">
                          <summary className="min-h-11 py-3 text-sm">
                            권한·상태 변경
                          </summary>
                          <ManageMemberForm
                            id={m.user_id}
                            workspaceId={id}
                            role={m.role}
                            status={m.status}
                            self={m.user_id === profile.id}
                          />
                        </details>
                      )}
                  </li>
                ),
              )}
          </ul>
        )}
        {target.role === "admin" &&
          (target.id === workspace.id ? (
            <WorkspaceInvitationPanel
              workspaceId={id}
              invitations={inviteResult?.data ?? []}
              error={!!inviteResult?.error}
            />
          ) : (
            <p className="mt-6 text-sm text-neutral-600">
              초대와 권한 변경은 상단에서 이 워크스페이스로 전환한 후 사용할 수
              있습니다.
            </p>
          ))}
      </section>
      {target.role === "admin" && (
        <DeleteWorkspaceForm
          key={`delete:${target.name}`}
          workspaceId={id}
          name={target.name}
        />
      )}
    </div>
  );
}
