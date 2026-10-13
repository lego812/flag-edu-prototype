"use client";

import Link, { useLinkStatus } from "next/link";
import { createPortal } from "react-dom";
import type { ComponentProps } from "react";
import { useRef, useState } from "react";
import { useNavigationGuard } from "./navigation-guard";
import { canPrefetchList } from "./navigation-prefetch";
import { LoadingSpinner } from "./loading-indicator";

function LinkFeedback() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <>
      <span
        data-link-pending="true"
        aria-hidden="true"
        className="link-pending"
      >
        <LoadingSpinner />
      </span>
      {createPortal(
        <div
          role="status"
          aria-label="페이지 이동 중"
          className="navigation-feedback"
        >
          <span aria-hidden="true" className="navigation-progress" />
          <span className="sr-only">페이지 이동 중</span>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function FeedbackLink({
  children,
  className = "",
  onClick,
  onNavigate,
  onMouseEnter,
  onFocus,
  onTouchStart,
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const [intentHref, setIntentHref] = useState<string>();
  const targeted = prefetch === undefined && canPrefetchList(props.href) &&
    (!props.target || props.target === "_self") && !props.download;
  const prepare = () => {
    if (targeted && typeof props.href === "string") setIntentHref(props.href);
  };
  const destination = useRef<string | undefined>(undefined);
  const { requestNavigation, navigate } = useNavigationGuard();
  return (
    <Link
      {...props}
      prefetch={targeted ? intentHref === props.href : prefetch}
      onMouseEnter={(event) => {
        onMouseEnter?.(event);
        if (!event.defaultPrevented) prepare();
      }}
      onFocus={(event) => {
        onFocus?.(event);
        if (!event.defaultPrevented) prepare();
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event);
        if (!event.defaultPrevented) prepare();
      }}
      className={`feedback-link ${className}`}
      onClick={(event) => {
        destination.current = event.currentTarget.href;
        onClick?.(event);
      }}
      onNavigate={(event) => {
        let cancelled = false;
        onNavigate?.({
          preventDefault: () => {
            cancelled = true;
            event.preventDefault();
          },
        });
        if (cancelled || !destination.current) return;
        const url = new URL(destination.current);
        if (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        )
          return;
        const target = url.pathname + url.search + url.hash;
        if (
          !requestNavigation(() => {
            navigate(target, { replace: props.replace, scroll: props.scroll });
          })
        )
          event.preventDefault();
      }}
    >
      {children}
      <LinkFeedback />
    </Link>
  );
}
