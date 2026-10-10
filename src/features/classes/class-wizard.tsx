"use client";
import { SubmitButton } from "@/components/submit-button";
import Link from "@/components/feedback-link";
import { useActionState, useRef, useState } from "react";
import { createScheduleAction, updateClassAction } from "./actions";
import { addDays, seoulToday, toSeoulInput } from "./dates";
import { buildSchedule, type RepeatUnit } from "./recurrence";
import { parseClassForm, type ClassFormState } from "./validation";
import type { ClassSession, Course } from "./model";
import { CountPicker } from "@/components/count-picker";

const WEEKDAYS = [
  { value: 1, label: "월" },
  { value: 2, label: "화" },
  { value: 3, label: "수" },
  { value: 4, label: "목" },
  { value: 5, label: "금" },
  { value: 6, label: "토" },
  { value: 0, label: "일" },
];
export function ClassWizard({
  session,
  courses,
  initialCourseId,
}: {
  session?: ClassSession;
  courses: Course[];
  initialCourseId?: string;
}) {
  const [step, setStep] = useState(0);
  const [courseId, setCourseId] = useState(
    session?.course_id ??
      courses.find((course) => course.id === initialCourseId)?.id ??
      courses[0]?.id ??
      "",
  );
  const selectedCourse = courses.find((course) => course.id === courseId);
  const title = selectedCourse?.title ?? session?.title ?? "";
  const location = selectedCourse?.location ?? session?.location ?? "";
  const memo = selectedCourse?.memo ?? session?.memo ?? "";
  const method =
    selectedCourse?.teaching_method ?? session?.teaching_method ?? "";
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
  const [state, submit, pending] = useActionState<ClassFormState, FormData>(
    session ? updateClassAction.bind(null, session.id) : createScheduleAction,
    {},
  );
  const titles = [
    "수업을 선택해 주세요.",
    "얼마나 자주 진행하나요?",
    "등록 내용을 확인해 주세요.",
  ];
  function payload() {
    const form = new FormData();
    form.set("title", title);
    form.set("location", location);
    form.set("memo", memo);
    form.set("teaching_method", method);
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
        !selectedCourse
      ) {
        setError("먼저 등록된 수업을 선택해 주세요.");
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
      if (step === 1) {
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
  const scheduleTimeLabel = !hasTime
    ? "시간 미정"
    : endDay === day
      ? `${startTime} ~ ${endTime} (한국 시간)`
      : `${day} ${startTime} ~ ${endDay} ${endTime} (한국 시간)`;
  return (
    <form
      action={submit}
      onSubmit={(e) => {
        if (step !== 2) {
          e.preventDefault();
          go(step + 1);
        }
      }}
      className="space-y-8"
    >
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="course_id" value={courseId} />
      <input type="hidden" name="location" value={location} />
      <input type="hidden" name="memo" value={memo} />
      <input type="hidden" name="teaching_method" value={method} />
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
      <div aria-label={`등록 단계 ${step + 1}/3`} className="flex gap-2">
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
        <p className="eyebrow">STEP {step + 1} / 3</p>
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
            <label className="block text-sm font-semibold">
              수업
              <select
                className="input mt-2"
                value={courseId}
                onChange={(event) => setCourseId(event.target.value)}
              >
                <option value="">수업을 선택하세요</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </label>
            {selectedCourse && (
              <div className="surface space-y-2 border border-neutral-200 p-5">
                <p className="font-bold">{selectedCourse.title}</p>
                <p className="text-sm text-neutral-600">
                  {selectedCourse.location}
                </p>
                {selectedCourse.teaching_method && (
                  <p className="whitespace-pre-wrap text-sm">
                    {selectedCourse.teaching_method}
                  </p>
                )}
              </div>
            )}
            <Link href="/courses/new" className="btn-secondary w-fit">
              새 수업 등록
            </Link>
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
                  <div className="block text-sm font-semibold">
                    <p>수업 간격</p>
                    <div className="mt-2 flex items-center gap-3">
                      <CountPicker
                        label="반복 간격"
                        min={1}
                        max={365}
                        value={every}
                        onChange={setEvery}
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
                  </div>
                )}
              </>
            )}
          </>
        )}
        {step === 1 && (
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
            <p className="text-sm text-neutral-500">
              장소·진행방식·메모는 선택한 수업의 기본정보를 사용합니다.
            </p>
          </>
        )}
        {step === 2 && (
          <div className="surface space-y-4 p-6">
            <h3 className="break-words text-xl font-bold">{title}</h3>
            <p className="break-words text-neutral-600">{location}</p>
            <p>{scheduleTimeLabel}</p>
            <p className="font-semibold">
              총 {preview.length}개 수업
              {session ? " 중 선택한 1건 수정" : " 등록"}
            </p>
            <ul className="max-h-48 overflow-auto text-sm leading-7">
              {preview.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {method && (
              <p className="whitespace-pre-wrap break-words text-sm">
                {method}
              </p>
            )}
            {memo && (
              <p className="whitespace-pre-wrap break-words text-sm">{memo}</p>
            )}
            <p className="text-xs text-neutral-500">
              등록 후에는 각 수업을 개별 수정·취소합니다.
            </p>
          </div>
        )}
      </fieldset>
      {(error || state.error || (step === 2 && previewError)) && (
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
        {step < 2 ? (
          <button
            key="next-step"
            type="button"
            className="btn"
            onClick={() => go(step + 1)}
          >
            다음 →
          </button>
        ) : (
          <SubmitButton pendingLabel="저장 중…" pending={pending}
            key="submit-schedule"
            type="submit"
            className="btn"
            disabled={pending || !!previewError || !preview.length}
          >
            {session ? "수정 저장" : `${preview.length}개 수업 등록`}
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
