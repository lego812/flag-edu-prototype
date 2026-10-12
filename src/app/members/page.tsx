import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { requireCurrentProfile } from "@/features/auth/current-user";
import { InviteForm } from "@/features/members/invite-form";
import { CancelInviteButton } from "@/features/members/cancel-invite-button";
import Link from "@/components/feedback-link";
export const metadata = { title: "워크스페이스 초대 관리" };
export default async function MembersPage() {
  const { supabase, profile, workspace, workspaces } =
    await requireCurrentProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  const inviteResult = await supabase
    .from("workspace_invitations")
    .select("id,email,status,expires_at")
    .eq("organization_id", profile.organization_id)
    .order("created_at", { ascending: false });
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
        <h1 className="text-3xl font-bold">{workspace.name} · 초대 관리</h1>
        <Link
          href={`/workspaces/${workspace.id}`}
          className="text-sm underline"
        >
          참여자·권한 보기
        </Link>
        <section className="border-y border-neutral-200 py-6">
          <h2 className="mb-4 font-bold">워크스페이스 초대</h2>
          <p className="mb-4 text-sm text-neutral-600">
            상대방의 로그인 이메일로 초대합니다. 메일은 발송되지 않으며 앱에서
            수락하면 참여합니다.
          </p>
          <InviteForm />
        </section>
        <section>
          <h2 className="font-bold">보낸 초대</h2>
          {inviteResult.error ? (
            <p role="alert">
              초대 목록을 불러오지 못했습니다. 새로고침해 주세요.
            </p>
          ) : (
            <ul>
              {inviteResult.data?.map((i) => (
                <li
                  key={i.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b py-4"
                >
                  <span className="break-all">{i.email}</span>
                  <span>
                    {i.status === "accepted"
                      ? "수락 완료"
                      : i.status === "declined"
                        ? "거절"
                        : i.status === "cancelled"
                          ? "취소"
                          : new Date(i.expires_at) <= new Date()
                            ? "만료"
                            : "수락 대기"}
                  </span>
                  {i.status === "pending" && <CancelInviteButton id={i.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
