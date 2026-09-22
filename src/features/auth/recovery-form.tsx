"use client";
import { useActionState } from "react";
import { recoveryAction } from "./recovery-action";
export function RecoveryForm() {
  const [state, action, pending] = useActionState(recoveryAction, {});
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        이메일
        <input
          name="email"
          type="email"
          autoComplete="email"
          className="input mt-2"
          required
          disabled={pending}
        />
      </label>
      <button className="btn" disabled={pending}>
        {pending ? "발송 중…" : "비밀번호 설정 메일 보내기"}
      </button>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
