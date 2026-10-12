import { InboxForm } from "./inbox-form";
export type WorkspaceInvitation = {
  id: string;
  workspace_name: string;
  expires_at: string;
};
export function InvitationList({
  invitations,
  error = false,
  onDeclined,
}: {
  invitations: WorkspaceInvitation[];
  error?: boolean;
  onDeclined?: (id: string) => void;
}) {
  if (error)
    return <p role="alert">초대를 불러오지 못했습니다. 다시 시도해 주세요.</p>;
  if (!invitations.length)
    return <p className="text-sm text-neutral-600">받은 초대가 없습니다.</p>;
  return (
    <ul className="space-y-4">
      {invitations.map((invite) => (
        <li
          key={invite.id}
          className="rounded-lg border border-neutral-200 p-4"
        >
          <h3 className="break-words font-bold">{invite.workspace_name}</h3>
          <p className="mt-2 text-sm text-neutral-600">
            {new Date(invite.expires_at).toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}
            까지 수락할 수 있습니다.
          </p>
          <InboxForm
            id={invite.id}
            onDeclined={onDeclined ? () => onDeclined(invite.id) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
