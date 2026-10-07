"use client";

import { useActionState } from "react";
import {
  createWorkspaceAction,
  type WorkspaceActionState,
} from "./actions";

const initialState: WorkspaceActionState = {};

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(
    createWorkspaceAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <label className="block text-sm font-semibold">
        워크스페이스 이름
        <input
          name="name"
          required
          minLength={2}
          maxLength={100}
          className="input mt-2"
          placeholder="예: 수원시 교육지원센터"
        />
      </label>
      <p className="text-xs text-neutral-500">
        만든 사람은 새 워크스페이스의 관리자가 되며 바로 전환됩니다.
      </p>
      <button className="btn" disabled={pending}>
        {pending ? "만드는 중…" : "워크스페이스 만들기"}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
