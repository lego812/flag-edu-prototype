"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { LoadingSpinner } from "./loading-indicator";

function LinkFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span data-link-pending="true" aria-hidden="true" className="link-pending"><LoadingSpinner /></span>
      {createPortal(
        <div role="status" aria-label="페이지 이동 중" className="navigation-feedback">
          <span aria-hidden="true" className="navigation-progress" />
          <span className="navigation-message"><LoadingSpinner />이동 중…</span>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function FeedbackLink({ children, className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={`feedback-link ${className}`}>{children}<LinkFeedback /></Link>;
}
