"use client";
/* eslint-disable @next/next/no-img-element -- Keep private signed images out of a shared optimization cache. */
import { useEffect, useId, useRef, useState } from "react";

export function PhotoPreview({
  url,
  label,
  onClose,
}: {
  url: string;
  label: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-4xl overflow-auto rounded-3xl bg-white p-0 text-neutral-900 backdrop:bg-black/70"
      onClose={() => {
        // Native close events are queued. Strict Mode can close/reopen the
        // dialog before an old cleanup event arrives; do not dismiss the
        // newly opened preview in response to that stale event.
        if (!dialogRef.current?.open) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialogRef.current?.close();
      }}
    >
      <div className="p-4 sm:p-6">
        <header className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="min-w-0 self-center font-semibold [overflow-wrap:anywhere]">
            {label}
          </h2>
          <button
            type="button"
            className="min-h-11 shrink-0 rounded-full border border-neutral-300 px-4 text-sm font-medium hover:bg-neutral-100"
            onClick={() => dialogRef.current?.close()}
          >
            닫기
          </button>
        </header>
        {failed ? (
          <p role="alert" className="py-10 text-center text-sm text-neutral-600">
            사진을 불러오지 못했습니다. 보고서를 다시 열어 주세요.
          </p>
        ) : (
          <img
            src={url}
            alt={label}
            className="max-h-[calc(100dvh_-_10rem)] w-full rounded-xl object-contain"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </dialog>
  );
}
