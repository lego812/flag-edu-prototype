"use client";
import { SubmitButton } from "@/components/submit-button";
import { useActionState } from "react";
import { manageMemberAction } from "./manage-action";
export function ManageMemberForm({
  id,
  workspaceId,
  role,
  status,
  self,
}: {
  id: string;
  workspaceId: string;
  role: string;
  status: string;
  self: boolean;
}) {
  const [state, action, pending] = useActionState(manageMemberAction, {});
  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <fieldset disabled={pending} className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          역할
          <select name="role" defaultValue={role} className="input mt-1">
            <option value="coach">코치</option>
            <option value="admin">관리자</option>
          </select>
        </label>
        <label className="text-xs">
          상태
          <select
            name="status"
            defaultValue={status}
            className="input mt-1"
            disabled={self}
          >
            <option value="active">참여 중</option>
            <option value="inactive">비활성 (접근 중지)</option>
          </select>
        </label>
        {self && <input type="hidden" name="status" value={status} />}
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" name="confirm" value="yes" required />
          변경 확인
        </label>
        <SubmitButton pendingLabel="적용 중…" className="btn-secondary">
          적용
        </SubmitButton>
      </fieldset>
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
      <p className="text-xs text-neutral-500">비활성은 참여 정보를 유지하고 접근만 중지합니다. 참여를 종료하려면 내보내기를 사용하세요.</p>
    </form>
  );
}
