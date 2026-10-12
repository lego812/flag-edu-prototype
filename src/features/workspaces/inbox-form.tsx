"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { respondInvitationAction } from "./inbox-actions";
export function InboxForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(respondInvitationAction, {});
  return (
    <form action={action} className="mt-3 flex flex-wrap gap-3">
      <input type="hidden" name="invitationId" value={id} />
      <SubmitButton
        pending={pending}
        pendingLabel="수락 중…"
        name="decision"
        value="accept"
        className="min-h-11 rounded-lg bg-black px-5 py-3 text-white"
      >
        수락
      </SubmitButton>
      <SubmitButton
        pending={pending}
        pendingLabel="거절 중…"
        name="decision"
        value="decline"
        className="min-h-11 rounded-lg border px-5 py-3"
      >
        거절
      </SubmitButton>
      {state.error && (
        <p role="alert" className="w-full text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
