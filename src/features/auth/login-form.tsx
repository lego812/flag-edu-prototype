"use client";

import { useActionState } from "react";
import { loginAction, type AuthActionState } from "./actions";

const initialState: AuthActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <form action={action} className="mt-8 space-y-5">
      <label className="block">
        <span className="text-sm font-semibold text-neutral-700">이메일</span>
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none transition focus:border-black focus:ring-2 focus:ring-neutral-200"
        />
      </label>

      <label className="block">
        <span className="text-sm font-semibold text-neutral-700">비밀번호</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          minLength={8}
          required
          className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-3 outline-none transition focus:border-black focus:ring-2 focus:ring-neutral-200"
        />
      </label>

      {state.error && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-black px-4 py-3 font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
