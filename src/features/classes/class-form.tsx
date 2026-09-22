"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClassAction, updateClassAction } from "./actions";
import { toSeoulInput } from "./dates";
import type { ClassSession } from "./model";
import type { ClassFormState, ClassValues } from "./validation";

export function ClassForm({ session }: { session?: ClassSession }) {
  const action = session ? updateClassAction.bind(null, session.id) : createClassAction;
  const [state, submit, pending] = useActionState<ClassFormState, FormData>(action, {});
  const initial: ClassValues = {
    title: session?.title ?? "", location: session?.location ?? "",
    start: session ? toSeoulInput(session.start_at) : "",
    end: session ? toSeoulInput(session.end_at) : "", memo: session?.memo ?? "",
  };
  const values = state.values ?? initial;
  const fields = [
    { name: "title", label: "수업명", type: "text", maxLength: 150 },
    { name: "location", label: "장소 또는 기관명", type: "text", maxLength: 200 },
    { name: "start", label: "시작 일시", type: "datetime-local", maxLength: undefined },
    { name: "end", label: "종료 일시", type: "datetime-local", maxLength: undefined },
  ] as const;
  return (
    <form action={submit} className="space-y-6">
      {session && <input type="hidden" name="version" value={session.updated_at} />}
      <p className="text-sm text-slate-600">시작·종료 일시는 한국 시간 기준입니다. 메모를 제외한 항목은 필수입니다.</p>
      <fieldset disabled={pending} className="grid min-w-0 gap-5 sm:grid-cols-2">
        {fields.map(({ name, label, ...props }) => (
          <div key={name} className="min-w-0">
            <label htmlFor={name} className="text-sm font-semibold text-slate-700">{label}</label>
            <input {...props} id={name} name={name} required defaultValue={values[name]}
              aria-invalid={Boolean(state.fieldErrors?.[name])} aria-describedby={state.fieldErrors?.[name] ? name + "-error" : undefined}
              className="mt-2 block w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            {state.fieldErrors?.[name] && <p id={name + "-error"} className="mt-1 text-sm text-red-700">{state.fieldErrors[name]}</p>}
          </div>
        ))}
        <div className="sm:col-span-2">
          <label htmlFor="memo" className="text-sm font-semibold text-slate-700">메모 (선택)</label>
          <textarea id="memo" name="memo" rows={4} defaultValue={values.memo}
            className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
        </div>
      </fieldset>
      {state.error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{state.error}</p>}
      <div className="flex flex-wrap gap-3">
        <button disabled={pending} className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white disabled:opacity-60">
          {pending ? "저장 중…" : session ? "수정 저장" : "수업 등록"}
        </button>
        <Link href={session ? "/classes/" + session.id : "/classes"} className="rounded-xl border border-slate-300 px-6 py-3 text-slate-700">돌아가기</Link>
      </div>
    </form>
  );
}
