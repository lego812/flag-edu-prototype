"use client";

import { useActionState } from "react";
import {
  inviteCoachAction,
  type InviteActionState,
} from "@/features/members/actions";

const initialState: InviteActionState = {};

export function InviteForm() {
  const [state, action, pending] = useActionState(
    inviteCoachAction,
    initialState,
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">이름</span>
          <input
            name="name"
            maxLength={50}
            required
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-slate-700">이메일</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </div>

      {state.error && (
        <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
          role="status"
        >
          {state.success}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60"
      >
        {pending ? "초대 중…" : "코치 초대"}
      </button>
    </form>
  );
}
