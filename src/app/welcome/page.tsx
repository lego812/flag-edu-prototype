import { masterAccount } from "@/features/master/access";
import Link from "@/components/feedback-link";
import { SubmitButton } from "@/components/submit-button";
import { requireAccount } from "@/features/auth/current-user";
import { LogoutButton } from "@/features/auth/logout-button";
import { CreateWorkspaceForm } from "@/features/workspaces/create-form";
import { selectAvailableWorkspaceAction } from "@/features/workspaces/actions";

import { InvitationList } from "@/features/workspaces/invitation-list";

export const metadata = { title: "워크스페이스 시작하기" };

export default async function WelcomePage() {
  const { supabase, user, profile } = await requireAccount();
  const { data: memberships } = await supabase
    .from("workspace_memberships")
    .select("organization_id, organizations!inner(name)")
    .eq("user_id", user.id)
    .eq("status", "active");
  const { data: invitations, error: invitationError } = await supabase.rpc(
    "list_my_workspace_invitations",
  );
  const { isMaster } = await masterAccount();
  return (
    <main className="mx-auto min-h-svh max-w-xl space-y-8 px-5 py-12">
      <header>
        <p className="text-sm font-semibold">Flag Edu</p>
        <h1 className="mt-3 text-3xl font-bold">
          {profile.name}님, 환영합니다
        </h1>
        <p className="mt-3 leading-7 text-neutral-600">
          새 워크스페이스를 만들거나 앱에서 받은 초대를 수락해 시작하세요.
        </p>
      </header>
      {!!memberships?.length && (
        <section className="space-y-3">
          <h2 className="font-bold">참여 중인 워크스페이스</h2>
          {memberships.map((membership) => (
            <form
              key={membership.organization_id}
              action={selectAvailableWorkspaceAction}
            >
              <input
                type="hidden"
                name="workspaceId"
                value={membership.organization_id}
              />
              <SubmitButton
                className="w-full rounded-lg border border-neutral-300 px-4 py-3 text-left"
                pendingLabel="이동 중…"
              >
                {(membership.organizations as unknown as { name: string }).name}
              </SubmitButton>
            </form>
          ))}
        </section>
      )}

      {isMaster && (
        <section className="surface space-y-3 p-6">
          <h2 className="font-bold">서비스 관리 · master</h2>
          <div className="flex flex-wrap gap-5 text-sm">
            <Link href="/manage/users" className="underline">
              사용자 관리
            </Link>
            <Link href="/manage/all-workspaces" className="underline">
              전체 워크스페이스 조회
            </Link>
          </div>
        </section>
      )}
      <section className="border-y border-neutral-200 py-6">
        <h2 className="mb-4 text-lg font-bold">새 워크스페이스 만들기</h2>
        <CreateWorkspaceForm />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-bold">받은 초대</h2>
        <p className="mb-4 break-all text-sm text-neutral-600">
          {user.email} 계정의 초대입니다.
        </p>
        <InvitationList
          invitations={invitations ?? []}
          error={!!invitationError}
        />
      </section>
      <div className="flex items-center gap-5">
        <Link href="/manage/account" className="text-sm underline">
          계정 관리
        </Link>
        {!!memberships?.length && (
          <Link href="/dashboard" className="text-sm underline">
            홈으로
          </Link>
        )}
        <LogoutButton />
      </div>
    </main>
  );
}
