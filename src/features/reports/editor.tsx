"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { FieldInput } from "./field-input";
import type { Field, Report } from "./model";
import { saveReportAction } from "./actions";
export function ReportEditor({
  report,
  fields,
}: {
  report: Report;
  fields: Field[];
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(report.report_answers.map((a) => [a.field_id, a.value])),
  );
  const [state, action, pending] = useActionState(
    async (previous: import("./model").ActionState, form: FormData) => {
      setDraft(
        Object.fromEntries(
          fields
            .filter((f) => f.field_type !== "photo")
            .map((f) => [
              f.id,
              f.field_type === "multi_select"
                ? form.getAll(f.id)
                : form.get(f.id),
            ]),
        ),
      );
      try {
        return await saveReportAction(report.id, previous, form);
      } catch {
        return {
          error:
            "서버에 연결하지 못했습니다. 입력 내용은 유지됩니다. 다시 시도해 주세요.",
        };
      }
    },
    {},
  );
  const dirty = useRef(false);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);
  useEffect(() => {
    if (state.success) dirty.current = false;
  }, [state]);
  return (
    <form
      action={action}
      onChange={() => {
        dirty.current = true;
      }}
      className="max-w-2xl space-y-6"
    >
      <input type="hidden" name="version" value={report.updated_at} />
      <fieldset disabled={pending} className="space-y-6">
        {fields
          .filter((f) => f.field_type !== "photo")
          .map((f) => (
            <FieldInput key={f.id} field={f} value={draft[f.id]} />
          ))}
        <p className="text-sm text-neutral-600">
          사진은 아래 첨부 영역에서 별도로 저장합니다. 제출한 내용을 수정하면
          관리자 확인이 해제됩니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" name="intent" value="save">
            {report.status === "submitted" ? "변경 저장" : "임시저장"}
          </button>
          <button
            className="btn"
            name="intent"
            value="submit"
            disabled={report.class_sessions.status === "cancelled"}
          >
            제출
          </button>
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
