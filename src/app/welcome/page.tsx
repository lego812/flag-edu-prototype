import Link from "@/components/feedback-link";
import { SubmitButton } from "@/components/submit-button";
import { requireAccount } from "@/features/auth/current-user";
import { logoutAction } from "@/features/auth/actions";
import { CreateWorkspaceForm } from "@/features/workspaces/create-form";
import { selectAvailableWorkspaceAction } from "@/features/workspaces/actions";

import { InboxForm } from "@/features/workspaces/inbox-form";

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
      <section className="border-y border-neutral-200 py-6">
        <h2 className="mb-4 text-lg font-bold">새 워크스페이스 만들기</h2>
        <CreateWorkspaceForm />
      </section>
      <section>
        <h2 className="mb-4 text-lg font-bold">받은 초대</h2>
        <p className="mb-4 break-all text-sm text-neutral-600">
          {user.email} 계정의 초대입니다.
        </p>
        {invitationError ? (
          <p role="alert">초대를 불러오지 못했습니다. 새로고침해 주세요.</p>
        ) : !invitations?.length ? (
          <p className="text-neutral-600">받은 초대가 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {invitations.map(
              (invite: {
                id: string;
                workspace_name: string;
                expires_at: string;
              }) => (
                <li key={invite.id} className="rounded-lg border p-4">
                  <h3 className="font-bold">{invite.workspace_name}</h3>
                  <p className="mt-2 text-sm text-neutral-600">
                    {new Date(invite.expires_at).toLocaleDateString("ko-KR", {
                      timeZone: "Asia/Seoul",
                    })}
                    까지 수락할 수 있습니다.
                  </p>
                  <InboxForm id={invite.id} />
                </li>
              ),
            )}
          </ul>
        )}
      </section>
      <div className="flex items-center gap-5">
        {!!memberships?.length && (
          <Link href="/dashboard" className="text-sm underline">
            홈으로
          </Link>
        )}
        <form action={logoutAction}>
          <SubmitButton
            className="text-sm underline"
            pendingLabel="로그아웃 중…"
          >
            로그아웃
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
