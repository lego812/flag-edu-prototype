"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import { useRouter } from "next/navigation";

type GuardState = {
  dirty: boolean;
  busy: boolean;
  label?: "보고서" | "문의글";
};
type Guard = () => GuardState;
const NavigationGuard = createContext<{
  register: (guard: Guard) => () => void;
  requestNavigation: (proceed: () => void) => boolean;
  navigate: (
    target: string,
    options?: { replace?: boolean; scroll?: boolean },
  ) => void;
}>({
  register: () => () => {},
  requestNavigation: () => true,
  navigate: () => {},
});
export const useNavigationGuard = () => useContext(NavigationGuard);

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const guards = useRef(new Set<Guard>());
  const continuation = useRef<(() => void) | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("보고서");
  const register = useCallback((guard: Guard) => {
    guards.current.add(guard);
    return () => {
      guards.current.delete(guard);
    };
  }, []);
  const requestNavigation = useCallback((proceed: () => void) => {
    const states = [...guards.current].map((guard) => guard());
    if (!states.some((state) => state.dirty || state.busy)) return true;
    continuation.current = proceed;
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setBusy(states.some((state) => state.busy));
    setLabel(
      states.find((state) => state.dirty || state.busy)?.label ?? "보고서",
    );
    if (!dialog.current?.open) dialog.current?.showModal();
    return false;
  }, []);
  const navigate = useCallback(
    (target: string, options?: { replace?: boolean; scroll?: boolean }) => {
      if (options?.replace) router.replace(target, { scroll: options.scroll });
      else router.push(target, { scroll: options?.scroll });
    },
    [router],
  );
  const value = useMemo(
    () => ({ register, requestNavigation, navigate }),
    [register, requestNavigation, navigate],
  );
  return (
    <NavigationGuard.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        aria-label={`${label} 이동 확인`}
        className="m-auto w-[calc(100%_-_2.5rem)] max-w-md rounded-xl bg-white p-6 backdrop:bg-black/40"
        onClose={() => {
          continuation.current = null;
          previousFocus.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <h2 className="text-lg font-bold">
          {busy ? "저장이 진행 중입니다" : "저장하지 않은 내용이 있습니다"}
        </h2>
        <p className="mt-4 text-sm leading-7 text-neutral-600">
          {busy
            ? `${label === "보고서" ? "사진 또는 보고서" : label} 저장이 끝난 뒤 다시 이동해 주세요.`
            : `이동하면 아직 저장하지 않은 ${label} 내용이 사라집니다. 이동하시겠습니까?`}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            autoFocus
            className="btn-secondary"
            onClick={() => dialog.current?.close()}
          >
            {busy ? "닫기" : "계속 작성"}
          </button>
          {!busy && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                // Recheck a save that may have started while the confirmation was open.
                if ([...guards.current].some((guard) => guard().busy)) {
                  setBusy(true);
                  return;
                }
                const proceed = continuation.current;
                continuation.current = null;
                dialog.current?.close();
                proceed?.();
              }}
            >
              저장하지 않고 이동
            </button>
          )}
        </div>
      </dialog>
    </NavigationGuard.Provider>
  );
}

// Replays only a confirmed navigation form submission, including its submitter.
export function GuardedNavigationForm({
  children,
  onSubmit,
  ...props
}: ComponentProps<"form">) {
  const { requestNavigation } = useNavigationGuard();
  const approved = useRef(false);
  return (
    <form
      {...props}
      onSubmit={(event) => {
        onSubmit?.(event);
        if (event.defaultPrevented) return;
        if (approved.current) {
          approved.current = false;
          return;
        }
        const form = event.currentTarget;
        const submitter = (event.nativeEvent as SubmitEvent).submitter;
        if (
          !requestNavigation(() => {
            approved.current = true;
            form.requestSubmit(
              submitter instanceof HTMLButtonElement ||
                submitter instanceof HTMLInputElement
                ? submitter
                : undefined,
            );
          })
        )
          event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
