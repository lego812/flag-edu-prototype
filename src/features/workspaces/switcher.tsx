"use client";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "@/components/feedback-link";
import { LoadingSpinner } from "@/components/loading-indicator";
import type { WorkspaceSummary } from "@/features/auth/current-user";
import { switchWorkspaceInPopupAction } from "./actions";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: WorkspaceSummary;
  workspaces: WorkspaceSummary[];
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [state, action, pending] = useActionState(
    switchWorkspaceInPopupAction,
    {},
  );
  const [selected, setSelected] = useState<string>();
  useEffect(() => {
    if (dialog.current?.open) dialog.current.close();
  }, [current.id]);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`워크스페이스 변경: ${current.name}`}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className="inline-flex min-h-11 max-w-40 items-center gap-2 rounded-full border border-neutral-300 bg-white px-3 text-xs font-bold"
      >
        <span className="truncate">{current.name}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClose={() => trigger.current?.focus()}
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-2xl bg-white p-0 text-neutral-950 shadow-xl backdrop:bg-black/40"
      >
        <div className="p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-xl font-bold">
              워크스페이스 변경
            </h2>
            <button
              type="button"
              autoFocus
              aria-label="워크스페이스 팝업 닫기"
              onClick={() => dialog.current?.close()}
              className="flex size-11 items-center justify-center rounded-full hover:bg-neutral-100"
            >
              ✕
            </button>
          </div>
          <form action={action}>
            <ul className="mt-4 max-h-[55svh] space-y-2 overflow-y-auto">
              {workspaces.map((workspace) => (
                <li key={workspace.id}>
                  {workspace.id === current.id ? (
                    <div
                      aria-current="true"
                      className="rounded-lg bg-neutral-100 px-4 py-3"
                    >
                      <strong className="block break-words">
                        {workspace.name}
                      </strong>
                      <span className="text-xs text-neutral-600">
                        현재 사용 중 ·{" "}
                        {workspace.role === "admin" ? "관리자" : "코치"}
                      </span>
                    </div>
                  ) : (
                    <button
                      type="submit"
                      name="workspaceId"
                      value={workspace.id}
                      disabled={pending}
                      onClick={() => setSelected(workspace.id)}
                      aria-busy={pending && selected === workspace.id}
                      aria-label={`${workspace.name} ${workspace.role === "admin" ? "관리자" : "코치"}`}
                      className="w-full rounded-lg border border-neutral-200 px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-60"
                    >
                      {pending && selected === workspace.id ? (
                        <span className="inline-flex items-center gap-2">
                          <LoadingSpinner />
                          전환 중…
                        </span>
                      ) : (
                        <>
                          <span className="block break-words font-semibold">
                            {workspace.name}
                          </span>
                          <span className="text-xs text-neutral-500">
                            {workspace.role === "admin" ? "관리자" : "코치"}
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {state.error && (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {state.error}
              </p>
            )}
          </form>
          {current.role === "admin" && <Link
            href="/workspaces"
            onClick={() => dialog.current?.close()}
            className="mt-4 block min-h-11 border-t border-neutral-200 pt-4 text-sm underline"
          >
            새 워크스페이스 만들기
          </Link>}
        </div>
      </dialog>
    </>
  );
}
