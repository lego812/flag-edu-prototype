"use client";
import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { createScheduleAction, updateClassAction } from "./actions";
import { addDays, seoulToday, toSeoulInput } from "./dates";
import { buildSchedule, type RepeatUnit } from "./recurrence";
import { parseClassForm, type ClassFormState } from "./validation";
import type { ClassSession } from "./model";

const WEEKDAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];
export function ClassWizard({ session }: { session?: ClassSession }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(session?.title ?? "");
  const [location, setLocation] = useState(session?.location ?? "");
  const [memo, setMemo] = useState(session?.memo ?? "");
  const [day, setDay] = useState(
    session ? toSeoulInput(session.start_at).slice(0, 10) : seoulToday(),
  );
  const [endDay, setEndDay] = useState(
    session && session.has_time !== false
      ? toSeoulInput(session.end_at).slice(0, 10)
      : day,
  );
  const [hasTime, setHasTime] = useState(
    !!session && session.has_time !== false,
  );
  const [startTime, setStartTime] = useState(
    session ? toSeoulInput(session.start_at).slice(11) : "09:00",
  );
  const [endTime, setEndTime] = useState(
    session ? toSeoulInput(session.end_at).slice(11) : "10:00",
  );
  const [repeat, setRepeat] = useState<RepeatUnit>("none");
  const [every, setEvery] = useState("1");
  const [until, setUntil] = useState(addDays(day, 30));
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [monthDay, setMonthDay] = useState(String(Number(day.slice(8))));
  const [error, setError] = useState("");
  const [registration, setRegistration] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const fieldId = useId();
  const [state, submit, pending] = useActionState<ClassFormState, FormData>(
    session ? updateClassAction.bind(null, session.id) : createScheduleAction,
    {},
  );
  const titles = [
    "어떤 수업인가요?",
    "얼마나 자주 진행하나요?",
    "언제 진행하나요?",
    "등록 내용을 확인해 주세요.",
  ];
  function payload() {
    const form = new FormData();
    form.set("title", title);
    form.set("location", location);
    form.set("memo", memo);
    form.set("has_time", String(hasTime));
    form.set("start", hasTime ? day + "T" + startTime : day);
    form.set("end", hasTime ? endDay + "T" + endTime : "");
    return form;
  }
  let preview: string[] = [];
  let previewError = "";
  const parsed = parseClassForm(payload());
  if ("input" in parsed) {
    try {
      preview = buildSchedule(
        parsed.input,
        repeat,
        Number(every),
        until,
        weekdays,
        Number(monthDay),
      ).map((s) => toSeoulInput(s.start_at).slice(0, 10));
    } catch (e) {
      previewError = e instanceof Error ? e.message : "입력을 확인해 주세요.";
    }
  }
  function go(next: number) {
    if (!registration) setRegistration(crypto.randomUUID());
    setError("");
    if (next > step) {
      if (
        step === 0 &&
        (!title.trim() ||
          [...title.trim()].length > 150 ||
          !location.trim() ||
          [...location.trim()].length > 200)
      ) {
        setError("수업명(150자 이하)과 장소(200자 이하)를 입력해 주세요.");
        return;
      }
      if (
        step === 1 &&
        repeat !== "none" &&
        (!/^[1-9]\d*$/.test(every) || Number(every) > 365)
      ) {
        setError("반복 간격은 1~365 사이의 정수로 입력해 주세요.");
        return;
      }
      if (step === 2) {
        if ("state" in parsed) {
          setError(Object.values(parsed.state.fieldErrors ?? {}).join(" "));
          return;
        }
        if (previewError) {
          setError(previewError);
          return;
        }
      }
    }
    setStep(next);
    requestAnimationFrame(() => heading.current?.focus());
  }
  return (
    <form
      action={submit}
      onSubmit={(e) => {
        if (step !== 3) {
          e.preventDefault();
          go(step + 1);
        }
      }}
      className="space-y-8"
    >
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="memo" value={memo} />
      <input
        type="hidden"
        name="start"
        value={hasTime ? day + "T" + startTime : day}
      />
      <input
        type="hidden"
        name="end"
        value={hasTime ? endDay + "T" + endTime : ""}
      />
      <input type="hidden" name="has_time" value={String(hasTime)} />
      <input type="hidden" name="repeat" value={repeat} />
      <input type="hidden" name="every" value={every} />
      <input type="hidden" name="until" value={until} />
      <input type="hidden" name="month_day" value={monthDay} />
      {weekdays.map((d) => (
        <input key={d} type="hidden" name="weekday" value={d} />
      ))}
      <input type="hidden" name="registration_id" value={registration} />
      {session && (
        <input type="hidden" name="version" value={session.updated_at} />
      )}
      <div aria-label={`등록 단계 ${step + 1}/4`} className="flex gap-2">
        {titles.map((t, i) => (
          <span
            key={t}
            aria-hidden="true"
            className={
              "h-1 flex-1 rounded-full " +
              (i <= step ? "bg-black" : "bg-neutral-200")
            }
          />
        ))}
      </div>
      <header>
        <p className="eyebrow">STEP {step + 1} / 4</p>
        <h2
          ref={heading}
          tabIndex={-1}
          className="mt-3 text-2xl font-bold tracking-tight outline-none"
        >
          {titles[step]}
        </h2>
      </header>
      <fieldset disabled={pending} className="space-y-6">
        {step === 0 && (
          <>
            <label
              className="block text-sm font-semibold"
              htmlFor={fieldId + "title"}
            >
              수업명
              <input
                id={fieldId + "title"}
                className="input mt-2"
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 돌봄센터 체육 수업"
              />
            </label>
            <label className="block text-sm font-semibold">
              장소 또는 기관명
              <input
                className="input mt-2"
                maxLength={200}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="예: 바비두 돌봄센터"
              />
            </label>
          </>
        )}
        {step === 1 && (
          <>
            {session ? (
              <p className="text-neutral-600">
                선택한 수업 한 건만 수정합니다. 다른 반복 수업에는 영향을 주지
                않습니다.
              </p>
            ) : (
              <>
                <label className="block text-sm font-semibold">
                  반복
                  <select
                    className="input mt-2"
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value as RepeatUnit)}
                  >
                    <option value="none">반복 안 함</option>
                    <option value="day">일</option>
                    <option value="week">주</option>
                    <option value="month">월</option>
                  </select>
                </label>
                {repeat !== "none" && (
                  <label className="block text-sm font-semibold">
                    수업 간격
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        aria-label="반복 간격"
                        className="input max-w-28"
                        type="number"
                        min={1}
                        max={365}
                        value={every}
                        onChange={(e) => setEvery(e.target.value)}
                      />
                      <span>
                        {repeat === "day"
                          ? "일"
                          : repeat === "week"
                            ? "주"
                            : "개월"}
                        마다
                      </span>
                    </div>
                  </label>
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold">
                {repeat === "none" ? "수업 날짜" : "반복 시작일"}
                <input
                  className="input mt-2"
                  type="date"
                  value={day}
                  onChange={(e) => {
                    setDay(e.target.value);
                    setEndDay(e.target.value);
                  }}
                />
              </label>
              {repeat !== "none" && (
                <label className="block text-sm font-semibold">
                  반복 종료일
                  <input
                    className="input mt-2"
                    type="date"
                    min={day}
                    value={until}
                    onChange={(e) => setUntil(e.target.value)}
                  />
                </label>
              )}
            </div>
            {repeat === "week" && (
              <fieldset>
                <legend className="mb-3 text-sm font-semibold">
                  수업 요일 (여러 개 선택 가능)
                </legend>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <label
                      key={d.value}
                      className={
                        "flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-1 rounded-full border px-3 " +
                        (weekdays.includes(d.value)
                          ? "border-black bg-black text-white"
                          : "border-neutral-300 bg-white")
                      }
                    >
                      <input
                        className="sr-only"
                        type="checkbox"
                        checked={weekdays.includes(d.value)}
                        onChange={(e) =>
                          setWeekdays(
                            e.target.checked
                              ? [...weekdays, d.value]
                              : weekdays.filter((v) => v !== d.value),
                          )
                        }
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-xs text-neutral-500">
                  월요일 시작 주 기준입니다. 선택한 요일에 같은 시간이
                  적용됩니다.
                </p>
              </fieldset>
            )}
            {repeat === "month" && (
              <label className="block text-sm font-semibold">
                매월 날짜
                <select
                  className="input mt-2"
                  value={monthDay}
                  onChange={(e) => setMonthDay(e.target.value)}
                >
                  {Array.from({ length: 31 }, (_, i) => (
                    <option key={i} value={i + 1}>
                      {i + 1}일
                    </option>
                  ))}
                </select>
                <span className="mt-2 block text-xs font-normal text-neutral-500">
                  해당 날짜가 없는 달은 마지막 날에 진행합니다.
                </span>
              </label>
            )}
            <label className="flex min-h-12 items-center gap-3">
              <input
                type="checkbox"
                checked={hasTime}
                onChange={(e) => setHasTime(e.target.checked)}
              />
              시간 설정 (선택)
            </label>
            {hasTime ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold">
                    시작 시간
                    <input
                      className="input mt-2"
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </label>
                  <label className="text-sm font-semibold">
                    종료 시간
                    <input
                      className="input mt-2"
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </label>
                </div>
                <label className="block text-sm">
                  종료 날짜 (다음 날 종료하는 경우 변경)
                  <input
                    className="input mt-2"
                    type="date"
                    min={day}
                    value={endDay}
                    onChange={(e) => setEndDay(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                시간을 정하지 않아도 등록할 수 있습니다.
              </p>
            )}
            <label className="block text-sm font-semibold">
              메모 (선택)
              <textarea
                className="input mt-2"
                rows={3}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </label>
          </>
        )}
        {step === 3 && (
          <div className="surface space-y-4 p-6">
            <h3 className="break-words text-xl font-bold">{title}</h3>
            <p className="break-words text-neutral-600">{location}</p>
            <p>
              {hasTime ? `${startTime} ~ ${endTime} (한국 시간)` : "시간 미정"}
            </p>
            <p className="font-semibold">
              총 {preview.length}개 수업
              {session ? " 중 선택한 1건 수정" : " 등록"}
            </p>
            <ul className="max-h-48 overflow-auto text-sm leading-7">
              {preview.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {memo && (
              <p className="whitespace-pre-wrap break-words text-sm">{memo}</p>
            )}
            <p className="text-xs text-neutral-500">
              등록 후에는 각 수업을 개별 수정·취소합니다.
            </p>
          </div>
        )}
      </fieldset>
      {(error || state.error || (step === 3 && previewError)) && (
        <p role="alert" className="text-sm text-red-700">
          {error || state.error || previewError}
        </p>
      )}
      <div className="flex items-center justify-between gap-3">
        {step > 0 ? (
          <button
            type="button"
            className="btn-secondary"
            disabled={pending}
            onClick={() => go(step - 1)}
          >
            이전
          </button>
        ) : (
          <Link
            className="btn-secondary"
            href={session ? "/classes/" + session.id : "/classes"}
          >
            돌아가기
          </Link>
        )}
        {step < 3 ? (
          <button type="button" className="btn" onClick={() => go(step + 1)}>
            다음 →
          </button>
        ) : (
          <button
            className="btn"
            disabled={pending || !!previewError || !preview.length}
          >
            {pending
              ? "저장 중…"
              : session
                ? "수정 저장"
                : `${preview.length}개 수업 등록`}
          </button>
        )}
      </div>
    </form>
  );
}
