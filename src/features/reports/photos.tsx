"use client";
/* eslint-disable @next/next/no-img-element -- Private short-lived URLs are loaded directly, without a shared image cache. */
import { useRef, useState } from "react";
import { LoadingSpinner } from "@/components/loading-indicator";
import { SubmitButton } from "@/components/submit-button";
import { compressPhoto } from "./photo";
import type { Attachment, Field } from "./model";
import { useReportMutation } from "./mutation-context";
import { PhotoPreview } from "./photo-preview";
export function Photos({
  reportId,
  fields,
  attachments,
  editable,
  reading = false,
}: {
  reportId: string;
  fields: Field[];
  attachments: Attachment[];
  editable: boolean;
  reading?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [items, setItems] = useState(attachments);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; label: string } | null>(null);
  const previewTrigger = useRef<HTMLButtonElement | null>(null);
  const mutation = useReportMutation();
  const disabled = busy || mutation?.busy;
  async function upload(field: Field, files: File[]) {
    if (!files.length || processing.current) return;
    const maxFiles = field.settings.max_files ?? 3;
    const remaining = maxFiles - items.filter((item) => item.field_id === field.id).length;
    if (files.length > remaining) {
      setError(`사진은 최대 ${maxFiles}장까지 첨부할 수 있습니다. ${remaining}장 이하로 다시 선택해 주세요.`);
      return;
    }
    if (mutation && !mutation.start()) return;
    processing.current = true;
    setBusy(true);
    setError("");
    setUploadProgress({ completed: 0, total: files.length });
    let version = mutation?.version;
    let completed = 0;
    try {
      // Keep the report locked for the batch; each request uses the preceding
      // successful revision instead of racing concurrent photo mutations.
      for (const file of files) {
        const blob = await compressPhoto(file);
        const form = new FormData();
        form.set("field", field.id);
        form.set("version", version ?? "");
        form.set("file", blob, "photo.jpg");
        const response = await fetch(`/api/reports/${reportId}/photos`, {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        setItems((current) => [...current, result.attachment]);
        version = result.version;
        completed++;
        setUploadProgress({ completed, total: files.length });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "사진 업로드에 실패했습니다.";
      setError(files.length > 1
        ? `${completed}/${files.length}장 업로드 완료. ${message} 업로드되지 않은 사진은 다시 선택해 주세요.`
        : message);
    } finally {
      mutation?.finish(version);
      processing.current = false;
      setUploadProgress(null);
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (processing.current) return;
    if (mutation && !mutation.start()) return;
    processing.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${reportId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, version: mutation?.version }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setItems((current) => current.filter((item) => item.id !== id));
      setDeleteTarget(null);
      mutation?.finish(result.version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      mutation?.finish();
      processing.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      {fields
        .filter((f) => f.field_type === "photo")
        .map((f) => {
          const photos = items.filter((a) => a.field_id === f.id);
          const maxFiles = f.settings.max_files ?? 3;
          return (
            <div key={f.id} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className={reading ? "min-w-0 text-sm font-medium text-neutral-600 [overflow-wrap:anywhere]" : "font-semibold"}>
                  {f.label}
                  {editable && f.required ? " *" : ""}
                </h2>
                <span className="shrink-0 text-sm text-neutral-500">
                  {reading ? `${photos.length}장` : `${photos.length}/${maxFiles}장`}
                </span>
              </div>
              {!!photos.length && (
                <ul
                  aria-label={`${f.label} ${photos.length}장`}
                  tabIndex={0}
                  className="-mx-1 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto px-1 pb-3 pt-2 focus-visible:outline-2 focus-visible:outline-black"
                >
                  {photos.map((a, index) => (
                    <li
                      key={a.id}
                      className="relative size-20 shrink-0 snap-start sm:size-24"
                    >
                      {a.url ? (
                        <button
                          type="button"
                          aria-label={`${f.label} ${index + 1} 크게 보기`}
                          aria-haspopup="dialog"
                          className="block size-full rounded-xl focus-visible:outline-2 focus-visible:outline-black"
                          onClick={(event) => {
                            previewTrigger.current = event.currentTarget;
                            setPreview({ url: a.url!, label: `${f.label} ${index + 1}` });
                          }}
                        >
                          <img
                            src={a.url}
                            alt={`${f.label} ${index + 1}`}
                            className="size-full rounded-xl border border-neutral-200 object-cover"
                          />
                        </button>
                      ) : (
                        <p className="flex size-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-center text-xs text-neutral-500">
                          사진을 열지 못했습니다.
                        </p>
                      )}
                      {editable && (
                        <button
                          type="button"
                          aria-label={`${f.label} ${index + 1} 삭제`}
                          className="absolute -right-2 -top-2 flex size-11 items-start justify-end rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-black"
                          disabled={disabled}
                          onClick={() => setDeleteTarget(a.id)}
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-6 items-center justify-center rounded-full bg-black/75 text-base leading-none text-white"
                          >
                            ×
                          </span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {reading && (
                <p className="text-xs text-neutral-500">
                  {photos.length ? "사진을 누르면 크게 볼 수 있습니다." : "첨부된 사진이 없습니다."}
                </p>
              )}
              {editable && photos.length < maxFiles && (
                <label className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-neutral-300 bg-white px-5 text-sm font-semibold hover:border-black">
                  <span aria-hidden="true" className="text-lg">
                    +
                  </span>
                  사진 추가
                  <input
                    className="sr-only"
                    type="file"
                    aria-label={`${f.label} 선택`}
                    accept="image/*"
                    multiple
                    disabled={disabled}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) void upload(f, files);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      {busy && <p role="status" className="flex items-center gap-2 text-sm text-neutral-600"><LoadingSpinner />사진 처리 중…{uploadProgress && ` ${uploadProgress.completed}/${uploadProgress.total}장`}</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {preview && (
        <PhotoPreview
          url={preview.url}
          label={preview.label}
          onClose={() => {
            setPreview(null);
            // Safari does not consistently restore focus to clicked buttons.
            previewTrigger.current?.focus();
          }}
        />
      )}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !disabled)
              setDeleteTarget(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-delete-title"
            className="surface w-full max-w-sm p-6 shadow-2xl"
          >
            <h2 id="photo-delete-title" className="text-xl font-bold">
              사진을 삭제할까요?
            </h2>
            <p className="mt-2 text-sm text-neutral-600">
              삭제한 사진은 복구할 수 없습니다.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={disabled}
                onClick={() => setDeleteTarget(null)}
              >
                취소
              </button>
              <SubmitButton pending={busy} pendingLabel="삭제 중…"
                type="button"
                className="btn bg-red-700 hover:bg-red-600"
                disabled={disabled}
                onClick={() => void remove(deleteTarget)}
              >
                삭제
              </SubmitButton>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
