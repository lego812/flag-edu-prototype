"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useNavigationGuard } from "./navigation-guard";
export function BackButton() {
  const router = useRouter();
  const { requestNavigation } = useNavigationGuard();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        const go = () =>
          startTransition(() => {
            if (window.history.length > 1) router.back();
            else router.push("/dashboard");
          });
        if (requestNavigation(go)) go();
      }}
    >
      <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m15 5-7 7 7 7" />
      </svg>
    </button>
  );
}
