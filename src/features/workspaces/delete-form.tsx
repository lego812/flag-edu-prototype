"use client";
import { useActionState, useRef, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { deleteWorkspaceAction } from "./delete-actions";
export function DeleteWorkspaceForm({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(deleteWorkspaceAction, {});
  const [confirmation, setConfirmation] = useState("");
  const dialog = useRef<HTMLDialogElement>(null),
    trigger = useRef<HTMLButtonElement>(null);
  return (
    <section className="border-t border-neutral-200 pt-6">
      <button
        ref={trigger}
        type="button"
        disabled={pending}
        className="btn-secondary text-red-700"
        onClick={() => {
          setConfirmation("");
          dialog.current?.showModal();
        }}
      >
        워크스페이스 삭제
      </button>
      <dialog
        ref={dialog}
        aria-label="워크스페이스 삭제 확인"
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-xl bg-white p-6 backdrop:bg-black/40"
        onClose={() => trigger.current?.focus()}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) dialog.current?.close();
        }}
      >
        <h2 className="text-lg font-bold">워크스페이스를 삭제할까요?</h2>
        <p className="mt-3 text-sm leading-6">
          삭제하면 모든 참여자가 이 워크스페이스에 접근할 수 없습니다. 회원
          계정과 다른 워크스페이스 참여는 유지됩니다.
        </p>
        <p className="mt-3 text-sm leading-6 text-red-700">
          수업·보고서·사진은 삭제 후 30일간 보관한 뒤 영구 삭제됩니다. 복구가
          필요하면 30일 이내에 문의해 주세요.
        </p>
        <p className="mt-4 break-words text-sm">
          삭제하려면 <strong>{name}</strong>을 아래에 정확히 입력해 주세요.
        </p>
        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <label className="block text-sm font-medium">
            워크스페이스 이름 확인
            <input
              name="confirmationName"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              disabled={pending}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
            />
          </label>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              className="btn-secondary"
              disabled={pending}
              onClick={() => dialog.current?.close()}
            >
              취소
            </button>
            <SubmitButton
              pending={pending}
              disabled={confirmation !== name}
              pendingLabel="삭제 중…"
              className="btn-secondary text-red-700"
            >
              삭제 확인
            </SubmitButton>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
        </form>
      </dialog>
    </section>
  );
}
