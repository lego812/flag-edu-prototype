"use client";

import { useActionState } from "react";
import {
  resendCoachInvitationAction,
  type ResendInviteActionState,
} from "@/features/members/actions";

const initialState: ResendInviteActionState = {};

type ResendInviteButtonProps = {
  userId: string;
};

export function ResendInviteButton({ userId }: ResendInviteButtonProps) {
  const [state, action, pending] = useActionState(
    resendCoachInvitationAction,
    initialState,
  );

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg border border-neutral-300 px-3 py-2 text-xs font-semibold text-black hover:bg-neutral-100 disabled:opacity-60"
      >
        {pending ? "발송 중…" : "메일 재발송"}
      </button>
      {state.error && (
        <span className="max-w-52 text-right text-xs text-red-600" role="alert">
          {state.error}
        </span>
      )}
      {state.success && (
        <span className="text-xs text-neutral-700" role="status">
          {state.success}
        </span>
      )}
    </form>
  );
}
