"use client";

import { useId, useRef } from "react";

export function WorkspaceRoleHelp() {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label="참여자 권한 안내"
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="flex size-11 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span
          aria-hidden="true"
          className="flex size-5 items-center justify-center rounded-full border border-neutral-400 text-xs font-semibold"
        >
          ?
        </span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-xl bg-white p-6 backdrop:bg-black/40"
      >
        <h2 id={titleId} className="text-lg font-bold">
          참여자 권한 안내
        </h2>
        <p
          id={descriptionId}
          className="mt-4 text-sm leading-7 text-neutral-600"
        >
          관리자는 수업·보고서·양식과 참여자를 관리하고, 코치는 수업과 워크스페이스의
          모든 보고서를 조회하고 본인 보고서를 작성·수정할 수 있습니다.
        </p>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            autoFocus
            className="btn"
            onClick={() => dialog.current?.close()}
          >
            닫기
          </button>
        </div>
      </dialog>
    </>
  );
}
