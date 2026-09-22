"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
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
    if (state.success) {
      dirty.current = false;
      if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [state, router]);
  return (
    <form
      action={action}
      onChange={() => {
        dirty.current = true;
      }}
      className="max-w-2xl space-y-8 py-4"
    >
      <input type="hidden" name="version" value={report.updated_at} />
      <fieldset disabled={pending} className="space-y-10">
        {fields
          .filter((f) => f.field_type !== "photo")
          .map((f) => (
            <FieldInput
              key={f.id}
              field={f}
              value={draft[f.id]}
              onChange={() => {
                dirty.current = true;
              }}
            />
          ))}
        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" name="intent" value="save">
            임시저장
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
