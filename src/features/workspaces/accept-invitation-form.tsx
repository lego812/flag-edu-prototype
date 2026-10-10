"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { acceptInvitationAction } from "./invitation-actions";
export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, {});
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="token" value={token} />
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      <SubmitButton
        pending={pending}
        pendingLabel="초대 수락 중…"
        className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white"
      >
        초대 수락
      </SubmitButton>
    </form>
  );
}
