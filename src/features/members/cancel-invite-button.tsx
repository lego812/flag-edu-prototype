"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { cancelInvitationAction } from "./actions";
export function CancelInviteButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState(cancelInvitationAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="invitationId" value={id} />
      <SubmitButton
        pending={pending}
        pendingLabel="취소 중…"
        className="min-h-11 px-3 text-sm underline"
      >
        초대 취소
      </SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
