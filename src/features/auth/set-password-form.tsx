"use client";

import { useActionState } from "react";
import { setPasswordAction, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

type SetPasswordFormProps = {
  email: string;
};

export function SetPasswordForm({ email }: SetPasswordFormProps) {
  const [state, action, pending] = useActionState(
    setPasswordAction,
    initialState,
  );

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">로그인 이메일</span>
        <input
          type="email"
          value={email}
          readOnly
          className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-slate-600"
        />
        <span className="mt-2 block text-xs text-slate-500">
          앞으로 이 이메일로 로그인합니다.
        </span>
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">
          사용할 비밀번호
        </span>
        <input
          type="password"
          name="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      <label className="block">
        <span className="text-sm font-semibold text-slate-700">비밀번호 확인</span>
        <input
          type="password"
          name="passwordConfirm"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        />
      </label>
      {state.error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "가입 처리 중…" : "가입 완료하고 시작하기"}
      </button>
    </form>
  );
}
