"use client";

import { useFormStatus } from "react-dom";
import { createContext, useContext, type ComponentProps } from "react";
import { LoadingSpinner } from "./loading-indicator";

export const NavigationFormPending = createContext(false);

export function SubmitButton({ children, pending: externalPending = false, pendingLabel = "처리 중…", disabled, name, value, ...props }: ComponentProps<"button"> & { pending?: boolean; pendingLabel?: string }) {
  const status = useFormStatus();
  const navigationPending = useContext(NavigationFormPending);
  const pending = status.pending || externalPending || navigationPending;
  const busy = pending && (!name || !status.data || status.data.get(name) === String(value));
  return (
    <button {...props} type={props.type ?? "submit"} name={name} value={value} disabled={disabled || pending} aria-busy={busy}>
      <span className="grid items-center justify-items-center">
        <span className={`col-start-1 row-start-1 ${busy ? "invisible" : ""}`} aria-hidden={busy}>{children}</span>
        <span className={`col-start-1 row-start-1 inline-flex items-center gap-2 ${busy ? "" : "invisible"}`} aria-hidden={!busy}>
          <LoadingSpinner />{pendingLabel}
        </span>
      </span>
    </button>
  );
}
