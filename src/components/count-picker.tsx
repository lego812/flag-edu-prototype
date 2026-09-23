"use client";

import { useId, useRef, useState } from "react";

export function CountPicker({
  name,
  label,
  value,
  defaultValue = "",
  onChange,
  min = 0,
  max = 1000,
  disabled = false,
  placeholder = "선택",
}: {
  name?: string;
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [local, setLocal] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(
    Number(value ?? defaultValue) || min,
  );
  const current = value ?? local;
  const id = useId();
  const wheel = useRef<HTMLDivElement>(null);
  const limit = max;
  function change(next: string) {
    setLocal(next);
    onChange?.(next);
  }
  return (
    <div>
      {name && (
        <input type="hidden" name={name} value={current} disabled={disabled} />
      )}
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        className="input flex items-center justify-between text-left"
        onClick={() => {
          setOpen(!open);
          setHighlighted(
            Math.min(limit, Math.max(min, Number(current) || min)),
          );
          requestAnimationFrame(() => {
            if (wheel.current) {
              wheel.current.scrollTop =
                Math.min(limit - min, Math.max(0, Number(current) - min)) * 44;
              wheel.current.focus();
            }
          });
        }}
      >
        <span>{current || placeholder}</span>
        <span aria-hidden="true">↕</span>
      </button>
      {open && (
        <div className="mt-2 rounded-2xl bg-white p-3 shadow-sm" id={id}>
          <div
            ref={wheel}
            role="listbox"
            tabIndex={0}
            aria-label={label + " 선택"}
            onScroll={(e) =>
              setHighlighted(
                Math.min(
                  limit,
                  min + Math.round(e.currentTarget.scrollTop / 44),
                ),
              )
            }
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const next = Math.min(
                  limit,
                  Math.max(min, highlighted + (e.key === "ArrowDown" ? 1 : -1)),
                );
                e.currentTarget.scrollTop = (next - min) * 44;
                setHighlighted(next);
              }
              if (e.key === "Enter") {
                e.preventDefault();
                change(String(highlighted));
                setOpen(false);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            className="h-[220px] snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] text-center"
            style={{ scrollbarWidth: "none" }}
          >
            {Array.from({ length: limit - min + 1 }, (_, i) =>
              String(i + min),
            ).map((n) => (
              <button
                key={n}
                type="button"
                tabIndex={-1}
                role="option"
                aria-selected={highlighted === Number(n)}
                className={
                  "block h-11 w-full snap-center rounded-lg text-xl " +
                  (highlighted === Number(n)
                    ? "bg-neutral-100 font-bold text-black"
                    : "text-neutral-400")
                }
                onClick={() => {
                  change(n);
                  setOpen(false);
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="flex justify-between gap-2 border-t border-neutral-100 pt-2">
            <button
              type="button"
              className="min-h-11 px-3 text-sm"
              onClick={() => {
                change("");
                setOpen(false);
              }}
            >
              비우기
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (wheel.current)
                  change(
                    String(
                      Math.min(
                        limit,
                        min + Math.round(wheel.current.scrollTop / 44),
                      ),
                    ),
                  );
                setOpen(false);
              }}
            >
              선택
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
