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
          return (
            <div key={f.id} className="space-y-3">
              <h2 className="font-semibold">
                {f.label}
                {f.required ? " *" : ""} ({photos.length}/
                {f.settings.max_files ?? 3})
              </h2>
              <ul className="flex gap-3 overflow-x-auto pb-2">
                {photos.map((a) => (
                  <li key={a.id} className="relative shrink-0">
                    {a.url ? (
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="첨부 사진 크게 보기"
                      >
                        <img
                          src={a.url}
                          alt={f.label + " 첨부 사진"}
                          className="size-36 rounded-2xl object-cover sm:size-44"
                        />
                      </a>
                    ) : (
                      <p>사진을 열지 못했습니다. 새로고침해 주세요.</p>
                    )}
                    {editable && (
                      <button
                        type="button"
                        aria-label="사진 삭제"
                        className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-full bg-black/70 text-xl text-white"
                        disabled={busy}
                        onClick={() => remove(a.id)}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {editable && photos.length < (f.settings.max_files ?? 3) && (
                <div className="flex flex-wrap gap-3">
                  {[false, true].map((camera) => (
                    <label
                      key={String(camera)}
                      className="flex min-h-20 flex-1 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-neutral-300 bg-white px-5 text-sm hover:border-black"
                    >
                      <span aria-hidden="true" className="text-2xl">
                        {camera ? "◎" : "+"}
                      </span>
                      {camera ? "촬영" : "사진 추가"}
                      <input
                        className="sr-only"
                        type="file"
                        aria-label={
                          f.label + (camera ? " 사진 촬영" : " 사진 선택")
                        }
                        accept="image/*"
                        capture={camera ? "environment" : undefined}
                        disabled={busy}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(f.id, file);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  ))}
                </div>
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
