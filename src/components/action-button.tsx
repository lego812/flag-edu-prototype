"use client";
import { SubmitButton } from "@/components/submit-button";
import { useActionState } from "react";
import type { ActionState } from "@/features/reports/model";
export function ActionButton({
  action,
  children,
  confirm,
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  confirm?: string;
}) {
  const [state, submit, pending] = useActionState(action, {});
  return (
    <form action={submit} className="space-y-2">
      {confirm && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            required
            disabled={pending}
          />
          {confirm}
        </label>
      )}
      <SubmitButton className="btn" pending={pending}>{children}</SubmitButton>
      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="text-sm">
          {state.success}
        </p>
      )}
    </form>
  );
}
