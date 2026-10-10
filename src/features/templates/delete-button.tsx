"use client";
import { SubmitButton } from "@/components/submit-button";

import { useActionState, useState } from "react";
import { deactivateTemplateAction } from "./actions";

export function TemplateDeleteButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(
    deactivateTemplateAction.bind(null, id),
    {},
  );
  return (
    <>
      <button type="button" className="btn-secondary" onClick={() => setOpen(true)}>삭제</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5">
          <section role="dialog" aria-modal="true" aria-labelledby={`delete-template-${id}`} className="surface w-full max-w-md p-6 shadow-2xl">
            <h2 id={`delete-template-${id}`} className="text-xl font-bold">보고서 양식을 삭제할까요?</h2>
            <p className="mt-2 text-sm text-neutral-600">‘{name}’은 목록에서 숨겨지고 새 보고서에 사용되지 않습니다. 기존 보고서는 그대로 유지됩니다.</p>
            <form action={action} className="mt-6 space-y-3">
              <input type="hidden" name="confirm" value="yes" />
              <div className="flex justify-end gap-2">
                <button type="button" className="btn-secondary" disabled={pending} onClick={() => setOpen(false)}>취소</button>
                <SubmitButton pending={pending} pendingLabel="삭제 중…" className="btn bg-red-700 hover:bg-red-600" disabled={pending}>삭제</SubmitButton>
              </div>
              {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
