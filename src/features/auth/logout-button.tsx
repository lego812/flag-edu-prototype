"use client";

import { useActionState, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { logoutAction } from "./actions";

export function LogoutButton() {
  const [state, action, pending] = useActionState(logoutAction, {});
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn-secondary"
        disabled={pending}
        onClick={() => dialog.current?.showModal()}
      >
        로그아웃
      </button>
      <dialog
        ref={dialog}
        aria-label="로그아웃 확인"
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-xl bg-white p-6 backdrop:bg-black/40"
        onClose={() => trigger.current?.focus()}
        onCancel={(e) => {
          if (pending) e.preventDefault();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !pending) dialog.current?.close();
        }}
      >
        <h2 className="text-lg font-bold">정말로 로그아웃하시겠습니까?</h2>
        <form action={action} className="mt-6 space-y-4">
          <input type="hidden" name="confirm" value="yes" />
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
              pendingLabel="로그아웃 중…"
              className="btn-primary"
            >
              로그아웃
            </SubmitButton>
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-red-700">
              {state.error}
            </p>
          )}
        </form>
      </dialog>
    </>
  );
}
