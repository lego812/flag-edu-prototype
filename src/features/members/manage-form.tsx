"use client";
import { useActionState } from "react";
import { manageMemberAction } from "./manage-action";
export function ManageMemberForm({
  id,
  role,
  status,
  self,
}: {
  id: string;
  role: string;
  status: string;
  self: boolean;
}) {
  const [state, action, pending] = useActionState(manageMemberAction, {});
  return (
    <form action={action} className="w-full space-y-2">
      <input type="hidden" name="id" value={id} />
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
            <option value="active">활성</option>
            <option value="inactive">비활성</option>
          </select>
        </label>
        {self && <input type="hidden" name="status" value={status} />}
        <label className="flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" name="confirm" value="yes" required />
          변경 확인
        </label>
        <button className="btn-secondary">적용</button>
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
    </form>
  );
}
