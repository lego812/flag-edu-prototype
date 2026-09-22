import { addDays, isDate, parseSeoulDateTime, seoulToday } from "./dates";
import type { ClassInput } from "./model";

export type ClassValues = {
  title: string;
  location: string;
  start: string;
  end: string;
  memo: string;
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
  };
  const fieldErrors: NonNullable<ClassFormState["fieldErrors"]> = {};
  if (!values.title || [...values.title].length > 150)
    fieldErrors.title = "수업명은 1~150자로 입력해 주세요.";
  if (!values.location || [...values.location].length > 200)
    fieldErrors.location = "장소는 1~200자로 입력해 주세요.";
  const hasTime = form.get("has_time") !== "false";
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
      has_time: hasTime,
    },
    values,
  };
}

export type ClassFilters = {
  from: string;
  to: string;
  status: "all" | "scheduled" | "cancelled";
  page: number;
};
export function parseClassFilters(
  params: Record<string, string | string[] | undefined>,
):
  | { filters: ClassFilters; error?: undefined }
  | { error: string; filters?: undefined } {
  const today = seoulToday();
  const from = params.from ?? today;
  const to = params.to ?? addDays(today, 30);
  const status = params.status ?? "all";
  const page = params.page ?? "1";
  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    !isDate(from) ||
    !isDate(to) ||
    from > to ||
    to >= "9999-12-31"
  ) {
    return { error: "조회 시작일과 종료일을 올바르게 선택해 주세요." };
  }
  if (status !== "all" && status !== "scheduled" && status !== "cancelled")
    return { error: "올바른 수업 상태를 선택해 주세요." };
  if (typeof page !== "string" || !/^[1-9]\d{0,5}$/.test(page))
    return { error: "올바른 페이지 번호가 아닙니다." };
  return { filters: { from, to, status, page: Number(page) } };
}
