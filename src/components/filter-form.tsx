"use client";

import { useRouter } from "next/navigation";
import { useTransition, type ComponentProps } from "react";
import { createPortal } from "react-dom";
import { LoadingSpinner } from "./loading-indicator";
import { NavigationFormPending } from "./submit-button";

// Preserve native GET forms before hydration, and use a tracked transition afterwards.
export function FilterForm({ action, children, ...props }: Omit<ComponentProps<"form">, "action" | "onSubmit"> & { action: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <NavigationFormPending value={pending}><form {...props} action={action} aria-busy={pending} onSubmit={(event) => {
      event.preventDefault();
      if (pending) return;
      const url = new URL(action, window.location.href);
      const data = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
      url.search = new URLSearchParams([...data].map(([key, value]) => [key, String(value)])).toString();
      startTransition(() => router.push(url.pathname + url.search));
    }}>
      <fieldset disabled={pending} className="contents">{children}</fieldset>
      {pending && createPortal(<div role="status" className="navigation-feedback" aria-label="조회 중"><span aria-hidden="true" className="navigation-progress" /><span className="navigation-message"><LoadingSpinner />조회 중…</span></div>, document.body)}
    </form></NavigationFormPending>
  );
}
