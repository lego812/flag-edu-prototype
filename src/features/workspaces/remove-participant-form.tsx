"use client";
import { useActionState, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { removeParticipantAction } from "./participant-actions";
export function RemoveParticipantForm({
  workspaceId,
  userId,
  name,
}: {
  workspaceId: string;
  userId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(removeParticipantAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        disabled={pending}
        aria-label={`${name} 내보내기`}
        className="min-h-11 px-3 text-sm text-red-700 underline"
        onClick={() => dialog.current?.showModal()}
      >
        내보내기
      </button>
      <dialog
        ref={dialog}
        aria-label="참여자 내보내기 확인"
        onClose={() => trigger.current?.focus()}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) dialog.current?.close();
        }}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-xl bg-white p-6 backdrop:bg-black/40"
      >
        <h3 className="text-lg font-bold">참여자를 내보낼까요?</h3>
        <p className="mt-3 break-words text-sm leading-6">
          {name}님의 이 워크스페이스 접근이 차단됩니다. 작성한 보고서와 다른
          워크스페이스 참여는 유지됩니다.
        </p>
        <form action={action} className="mt-5 space-y-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="userId" value={userId} />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="confirm"
              value="yes"
              required
              disabled={pending}
            />
            참여 해제를 확인했습니다
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className="btn-secondary"
            >
              취소
            </button>
            <SubmitButton
              pending={pending}
              pendingLabel="내보내는 중…"
              className="btn-secondary text-red-700"
            >
              내보내기 확인
            </SubmitButton>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="text-sm">
              {state.success}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
