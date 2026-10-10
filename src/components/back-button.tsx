"use client";
import { useTransition } from "react";
import { LoadingSpinner } from "./loading-indicator";
import { useRouter } from "next/navigation";
export function BackButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="뒤로가기"
      className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-white"
      disabled={pending}
      aria-busy={pending}
      onClick={() => startTransition(() => {
        if (window.history.length > 1) router.back();
        else router.push("/dashboard");
      })}
    >
      {pending ? <LoadingSpinner /> : <svg
        aria-hidden="true"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="m15 5-7 7 7 7" />
      </svg>}
    </button>
  );
}
