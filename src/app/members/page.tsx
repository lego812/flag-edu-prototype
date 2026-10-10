import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { InviteForm } from "@/features/members/invite-form";
import { ResendInviteButton } from "@/features/members/resend-invite-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { ManageMemberForm } from "@/features/members/manage-form";
import { isInvitationExpired } from "@/features/workspaces/invitation-expiration";

export const metadata = { title: "구성원 관리" };

export default async function MembersPage() {
  const { supabase, profile, workspace, workspaces } =
    await requireCurrentProfile();

  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: members } = await supabase
    .from("workspace_memberships")
    .select("user_id, role, status, created_at, profiles!inner(name)")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: true });
  const { data: invitations, error: invitationsError } = await supabase
    .from("workspace_invitations")
    .select("id, email, expires_at")
    .eq("organization_id", profile.organization_id)
    .is("accepted_at", null)
    .order("created_at", { ascending: true });
  const adminClient = createAdminClient();
  // Resolve only this organization's members, rather than the global first 1,000 users.
  const authUserById = new Map<
    string,
    Awaited<
      ReturnType<typeof adminClient.auth.admin.getUserById>
    >["data"]["user"]
  >();
  for (let offset = 0; offset < (members?.length ?? 0); offset += 10) {
    await Promise.all(
      members!.slice(offset, offset + 10).map(async (member) => {
        const { data } = await adminClient.auth.admin.getUserById(
          member.user_id,
        );
        authUserById.set(member.user_id, data.user);
      }),
    );
  }

  return (
    <div className="min-h-svh">
      <AppHeader
        userId={profile.id}
        name={profile.name}
        isAdmin
        workspace={workspace}
        workspaces={workspaces}
      />
      <main className="mx-auto max-w-5xl space-y-8 px-5 py-8">
        <section>
          <h1 className="text-3xl font-bold tracking-tight text-neutral-950">
            구성원 관리
          </h1>
          <p className="mt-3 text-neutral-600">
            이메일로 워크스페이스에 초대합니다. 초대를 수락한 뒤 구성원으로
            참여합니다.
          </p>
        </section>

        <section className="border-y border-neutral-200 py-6">
          <h2 className="mb-5 text-lg font-bold text-neutral-950">코치 초대</h2>
          <InviteForm />
        </section>

        <section>
          <h2 className="border-b border-neutral-200 py-4 font-bold">
            초대 수락 대기
          </h2>
          {invitationsError ? (
            <p role="alert" className="py-4 text-sm text-red-700">
              초대 목록을 불러오지 못했습니다. 다시 시도해 주세요.
            </p>
          ) : !invitations?.length ? (
            <p className="py-4 text-sm text-neutral-500">
              대기 중인 초대가 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <span className="min-w-0 break-all text-sm">
                    {invitation.email}
                    <span className="mt-1 block text-xs text-neutral-500">
                      {isInvitationExpired(invitation.expires_at)
                        ? "초대 만료 · 재발송 필요"
                        : "초대 수락 대기중"}
                    </span>
                  </span>
                  <ResendInviteButton invitationId={invitation.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section>
          <div className="border-b border-neutral-200 py-4">
            <h2 className="font-bold text-neutral-950">현재 구성원</h2>
          </div>
          <ul className="divide-y divide-neutral-100">
            {members
              ?.filter((member) => member.status !== "pending")
              .map((member) => (
                <li
                  key={member.user_id}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <span className="min-w-0 break-words font-medium text-neutral-900">
                    {(member.profiles as unknown as { name: string }).name}
                  </span>
                  {(() => {
                    const authUser = authUserById.get(member.user_id);
                    const isInvitationPending =
                      Boolean(authUser) && member.status === "pending";

                    return (
                      <div className="flex flex-wrap items-center gap-3">
                        <span
                          className={`text-sm ${
                            isInvitationPending
                              ? "rounded px-2 py-1 font-medium bg-accent text-black"
                              : "text-neutral-500"
                          }`}
                        >
                          {member.role === "admin" ? "관리자" : "코치"} ·{" "}
                          {!authUser
                            ? "가입 상태 확인 불가"
                            : isInvitationPending
                              ? "초대 수락 대기중"
                              : member.status === "active"
                                ? "활성"
                                : "비활성"}
                        </span>
                      </div>
                    );
                  })()}
                  {member.status !== "pending" && (
                    <details className="w-full">
                      <summary className="cursor-pointer py-2 text-sm text-neutral-600">
                        권한·상태 변경
                      </summary>
                      <ManageMemberForm
                        id={member.user_id}
                        role={member.role}
                        status={member.status}
                        self={member.user_id === profile.id}
                      />
                    </details>
                  )}
                </li>
              ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
