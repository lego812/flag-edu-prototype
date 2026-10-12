"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { renameWorkspaceAction } from "./rename-actions";
export function RenameWorkspaceForm({
  workspaceId,
  name,
}: {
  workspaceId: string;
  name: string;
}) {
  const [state, action, pending] = useActionState(renameWorkspaceAction, {});
  return (
    <details className="surface p-6">
      <summary className="min-h-11 py-2 font-semibold">
        워크스페이스 이름 변경
      </summary>
      <form action={action} className="mt-4 space-y-4">
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <input type="hidden" name="expectedName" value={name} />
        <label className="block text-sm font-medium">
          워크스페이스 이름
          <input
            name="name"
            defaultValue={name}
            required
            minLength={2}
            maxLength={100}
            disabled={pending}
            className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3"
          />
        </label>
        <SubmitButton
          pending={pending}
          pendingLabel="변경 중…"
          className="btn-primary"
        >
          이름 저장
        </SubmitButton>
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
    </details>
  );
}
