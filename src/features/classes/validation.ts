import { addDays, isDate, parseSeoulDateTime, seoulToday } from "./dates";
import type { ClassInput, CourseInput } from "./model";

export type CourseFormState = {
  error?: string;
  values?: Partial<CourseInput>;
};

export function parseCourseForm(
  form: FormData,
): { input: CourseInput } | { state: CourseFormState } {
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const input: CourseInput = {
    title: value("title"),
    location: value("location"),
    teaching_method: value("teaching_method") || null,
    memo: value("memo") || null,
  };
  if (!input.title || [...input.title].length > 150)
    return { state: { error: "수업명은 1~150자로 입력해 주세요.", values: input } };
  if (!input.location || [...input.location].length > 200)
    return { state: { error: "장소는 1~200자로 입력해 주세요.", values: input } };
  if ((input.teaching_method?.length ?? 0) > 2000)
    return { state: { error: "진행방식은 2,000자 이하로 입력해 주세요.", values: input } };
  if ((input.memo?.length ?? 0) > 5000)
    return { state: { error: "메모는 5,000자 이하로 입력해 주세요.", values: input } };
  return { input };
}

export type ClassValues = {
  title: string;
  location: string;
  start: string;
  end: string;
  memo: string;
  teaching_method?: string;
};
export type ClassFormState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof ClassValues, string>>;
  values?: ClassValues;
};

export function parseClassForm(
  form: FormData,
): { input: ClassInput; values: ClassValues } | { state: ClassFormState } {
  const text = (key: string) =>
    typeof form.get(key) === "string" ? String(form.get(key)).trim() : "";
  const values: ClassValues = {
    title: text("title"),
    location: text("location"),
    start: text("start"),
    end: text("end"),
    memo: text("memo"),
    teaching_method: text("teaching_method"),
  };
  const fieldErrors: NonNullable<ClassFormState["fieldErrors"]> = {};
  if (!values.title || [...values.title].length > 150)
    fieldErrors.title = "수업명은 1~150자로 입력해 주세요.";
  if (!values.location || [...values.location].length > 200)
    fieldErrors.location = "장소는 1~200자로 입력해 주세요.";
  const hasTime = form.get("has_time") !== "false";
  if ((values.teaching_method?.length ?? 0) > 2000)
    fieldErrors.teaching_method = "진행방식은 2,000자 이하로 입력해 주세요.";
  if (values.memo.length > 5000)
    fieldErrors.memo = "메모는 5,000자 이하로 입력해 주세요.";
  const validDate = isDate(values.start) && values.start < "9999-12-31";
  const start = hasTime
    ? parseSeoulDateTime(values.start)
    : validDate
      ? parseSeoulDateTime(values.start + "T00:00")
      : null;
  const end = hasTime
    ? parseSeoulDateTime(values.end)
    : validDate
      ? parseSeoulDateTime(addDays(values.start, 1) + "T00:00")
      : null;
  if (!start) fieldErrors.start = "올바른 시작 일시를 입력해 주세요.";
  if (!end) fieldErrors.end = "올바른 종료 일시를 입력해 주세요.";
  if (start && end && new Date(start) >= new Date(end))
    fieldErrors.end = "종료 일시는 시작 일시보다 늦어야 합니다.";
  if (Object.keys(fieldErrors).length)
    return {
      state: { error: "입력 내용을 확인해 주세요.", fieldErrors, values },
    };
  return {
    input: {
      title: values.title,
      location: values.location,
      start_at: start!,
      end_at: end!,
      memo: values.memo || null,
      teaching_method: values.teaching_method || null,
      has_time: hasTime,
    },
    values,
  };
}

export type ClassFilters = {
  from: string;
  to: string;
  status: "all" | "scheduled" | "cancelled" | "completed";
  sort: "newest" | "oldest";
  page: number;
};
export type ClassCalendarFilters = {
  month: string;
  status: ClassFilters["status"];
  date: string;
};

export function parseClassCalendarFilters(
  params: Record<string, string | string[] | undefined>,
):
  | { filters: ClassCalendarFilters; error?: undefined }
  | { error: string; filters?: undefined } {
  const month = params.month ?? seoulToday().slice(0, 7);
  const status = params.status ?? "all";
  const requestedDate = params.date;
  if (
    typeof month !== "string" ||
    !/^\d{4}-\d{2}$/.test(month) ||
    !isDate(`${month}-01`) ||
    month >= "9999-12"
  )
    return { error: "올바른 조회 월을 선택해 주세요." };
  if (
    status !== "all" &&
    status !== "scheduled" &&
    status !== "cancelled" &&
    status !== "completed"
  )
    return { error: "올바른 수업 상태를 선택해 주세요." };
  if (
    requestedDate !== undefined &&
    (typeof requestedDate !== "string" ||
      !isDate(requestedDate) ||
      !requestedDate.startsWith(`${month}-`))
  )
    return { error: "선택 날짜를 확인해 주세요." };
  const today = seoulToday();
  const date =
    typeof requestedDate === "string"
      ? requestedDate
      : today.startsWith(`${month}-`)
        ? today
        : `${month}-01`;
  return { filters: { month, status, date } };
}

export function parseClassFilters(
  params: Record<string, string | string[] | undefined>,
):
  | { filters: ClassFilters; error?: undefined }
  | { error: string; filters?: undefined } {
  const from = params.from ?? "";
  const to = params.to ?? "";
  const status = params.status ?? "all";
  const sort = params.sort ?? "newest";
  const page = params.page ?? "1";
  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    (from !== "" && !isDate(from)) ||
    (to !== "" && (!isDate(to) || to >= "9999-12-31")) ||
    (from !== "" && to !== "" && from > to)
  ) {
    return { error: "조회 시작일과 종료일을 올바르게 선택해 주세요." };
  }
  if (
    status !== "all" &&
    status !== "scheduled" &&
    status !== "cancelled" &&
    status !== "completed"
  )
    return { error: "올바른 수업 상태를 선택해 주세요." };
  if (sort !== "newest" && sort !== "oldest")
    return { error: "올바른 정렬 방식을 선택해 주세요." };
  if (typeof page !== "string" || !/^[1-9]\d{0,5}$/.test(page))
    return { error: "올바른 페이지 번호가 아닙니다." };
  return { filters: { from, to, status, sort, page: Number(page) } };
}
