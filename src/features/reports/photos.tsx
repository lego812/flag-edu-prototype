"use client";
/* eslint-disable @next/next/no-img-element -- Private short-lived URLs are loaded directly, without a shared image cache. */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressPhoto } from "./photo";
import type { Attachment, Field } from "./model";
export function Photos({
  reportId,
  fields,
  attachments,
  editable,
}: {
  reportId: string;
  fields: Field[];
  attachments: Attachment[];
  editable: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function upload(field: string, file: File) {
    setBusy(true);
    setError("");
    try {
      const blob = await compressPhoto(file);
      const form = new FormData();
      form.set("field", field);
      form.set("file", blob, "photo.jpg");
      const response = await fetch(`/api/reports/${reportId}/photos`, {
        method: "POST",
        body: form,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "사진 업로드 실패. 다시 선택해 주세요.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (!window.confirm("사진을 삭제할까요? 복구할 수 없습니다.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${reportId}/photos`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-6">
      {fields
        .filter((f) => f.field_type === "photo")
        .map((f) => {
          const photos = attachments.filter((a) => a.field_id === f.id);
          const maxFiles = f.settings.max_files ?? 3;
          return (
            <div key={f.id} className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-semibold">
                  {f.label}
                  {f.required ? " *" : ""}
                </h2>
                <span className="shrink-0 text-sm text-neutral-500">
                  {photos.length}/{maxFiles}장
                </span>
              </div>
              {!!photos.length && (
                <ul
                  aria-label={`${f.label} ${photos.length}장`}
                  tabIndex={0}
                  className="-mx-1 flex snap-x snap-mandatory flex-nowrap gap-2 overflow-x-auto px-1 pb-3 focus-visible:outline-2 focus-visible:outline-black"
                >
                  {photos.map((a, index) => (
                    <li
                      key={a.id}
                      className="relative size-20 shrink-0 snap-start sm:size-24"
                    >
                      {a.url ? (
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${f.label} ${index + 1} 크게 보기`}
                          className="block size-full rounded-xl focus-visible:outline-2 focus-visible:outline-black"
                        >
                          <img
                            src={a.url}
                            alt={`${f.label} ${index + 1}`}
                            className="size-full rounded-xl border border-neutral-200 object-cover"
                          />
                        </a>
                      ) : (
                        <p className="flex size-full items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 p-2 text-center text-xs text-neutral-500">
                          사진을 열지 못했습니다.
                        </p>
                      )}
                      {editable && (
                        <button
                          type="button"
                          aria-label={`${f.label} ${index + 1} 삭제`}
                          className="absolute right-0 top-0 flex size-11 items-start justify-end rounded-xl p-1 focus-visible:outline-2 focus-visible:outline-black"
                          disabled={busy}
                          onClick={() => remove(a.id)}
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
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(f.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
          );
        })}
      {busy && <p role="status">사진 처리 중…</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
