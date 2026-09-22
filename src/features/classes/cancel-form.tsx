"use client";

import { useActionState, useState } from "react";
import { cancelClassAction } from "./actions";
import type { ClassFormState } from "./validation";

export function CancelClassForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, submit, pending] = useActionState<ClassFormState, FormData>(cancelClassAction.bind(null, id), {});
  if (!open) return <button onClick={() => setOpen(true)} className="rounded-lg border border-red-200 px-5 py-3 font-semibold text-red-700">수업 취소</button>;
  return (
    <form action={submit} className="w-full rounded-lg border border-red-200 bg-red-50 p-5">
      <h2 className="font-bold text-red-900">이 수업을 취소할까요?</h2>
      <p className="mt-2 text-sm text-red-800">수업과 기존 보고서는 보존됩니다. 취소된 수업에는 새 보고서를 작성하거나 제출할 수 없습니다.</p>
      <label className="mt-4 flex items-center gap-2 text-sm text-red-900">
        <input type="checkbox" name="confirm" value="yes" required disabled={pending} /> 수업 취소를 확인했습니다.
      </label>
      {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
      <div className="mt-4 flex gap-3">
        <button disabled={pending} className="rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{pending ? "취소 중…" : "취소 확정"}</button>
        <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-lg border border-red-200 px-4 py-3 text-sm">돌아가기</button>
      </div>
    </form>
  );
}
