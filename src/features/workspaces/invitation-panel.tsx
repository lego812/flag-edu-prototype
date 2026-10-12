import { InviteForm } from "@/features/members/invite-form";
import { CancelInviteButton } from "@/features/members/cancel-invite-button";
export function WorkspaceInvitationPanel({
  workspaceId,
  invitations,
  error,
}: {
  workspaceId: string;
  invitations: {
    id: string;
    email: string;
    status: string;
    expires_at: string;
  }[];
  error: boolean;
}) {
  const inviteResult = { data: invitations, error };
  return (
    <div className="mt-6 border-t border-neutral-200 pt-6">
      <section className="pb-6">
        <h3 className="mb-4 font-bold">워크스페이스 초대</h3>
        <p className="mb-4 text-sm text-neutral-600">
          상대방의 로그인 이메일로 초대합니다. 메일은 발송되지 않으며 앱에서
          수락하면 참여합니다.
        </p>
        <InviteForm workspaceId={workspaceId} />
      </section>
      <section>
        <h3 className="font-bold">보낸 초대</h3>
        {inviteResult.error ? (
          <p role="alert">
            초대 목록을 불러오지 못했습니다. 새로고침해 주세요.
          </p>
        ) : !invitations.length ? (
          <p className="mt-3 text-sm text-neutral-500">보낸 초대가 없습니다.</p>
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
    </div>
  );
}
