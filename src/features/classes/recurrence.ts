import { addDays, isDate, parseSeoulDateTime, toSeoulInput } from "./dates";
import type { ClassInput } from "./model";
export type RepeatUnit = "none" | "day" | "week" | "month";
export function occurrenceDates(
  start: string,
  unit: RepeatUnit,
  every: number,
  until: string,
  weekdays: number[] = [],
  monthDay?: number,
): string[] {
  if (!isDate(start) || start >= "9999-12-31")
    throw new Error("수업 날짜를 확인해 주세요.");
  if (unit === "none") return [start];
  if (
    !["day", "week", "month"].includes(unit) ||
    !Number.isInteger(every) ||
    every < 1 ||
    every > 365
  )
    throw new Error("반복 간격은 1~365 사이의 정수로 입력해 주세요.");
  if (!isDate(until) || until < start || until >= "9999-12-31")
    throw new Error("반복 종료일은 수업 날짜 이후로 선택해 주세요.");
  if (unit === "week") {
    if (
      !weekdays.length ||
      weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
    )
      throw new Error("반복할 요일을 하나 이상 선택해 주세요.");
    const days: string[] = [];
    const anchor = new Date(start + "T00:00:00Z");
    const monday = addDays(start, -((anchor.getUTCDay() + 6) % 7));
    for (let week = 0; week <= 367; week++) {
      let found = false;
      for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
        const day = addDays(monday, week * every * 7 + offset);
        if (day.length !== 10 || day > until) return days;
        if (day >= start && weekdays.includes((offset + 1) % 7)) {
          days.push(day);
          found = true;
          if (days.length > 366)
            throw new Error("한 번에 최대 366개 수업을 만들 수 있습니다.");
        }
      }
      if (!found && week > 0 && addDays(monday, week * every * 7) > until)
        break;
    }
    return days;
  }
  if (
    monthDay !== undefined &&
    (!Number.isInteger(monthDay) || monthDay < 1 || monthDay > 31)
  )
    throw new Error("매월 날짜는 1~31일로 선택해 주세요.");
  const dates: string[] = [];
  for (let index = 0; index <= 367; index++) {
    let day: string;
    if (unit === "month") {
      const [year, month, date] = start.split("-").map(Number);
      const target = new Date(Date.UTC(year, month - 1 + index * every, 1));
      if (target.getUTCFullYear() > 9999) break;
      const last = new Date(
        Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
      ).getUTCDate();
      target.setUTCDate(Math.min(monthDay ?? date, last));
      day = target.toISOString().slice(0, 10);
    } else day = addDays(start, index * every);
    if (day > until || day.length !== 10) break;
    if (day >= start) dates.push(day);
    if (dates.length > 366)
      throw new Error(
        "한 번에 최대 366개 수업을 만들 수 있습니다. 종료일을 줄여 주세요.",
      );
  }
  return dates;
}
export function buildSchedule(
  input: ClassInput,
  unit: RepeatUnit,
  every: number,
  until: string,
  weekdays: number[] = [],
  monthDay?: number,
): ClassInput[] {
  const start = toSeoulInput(input.start_at);
  const days = occurrenceDates(
    start.slice(0, 10),
    unit,
    every,
    until,
    weekdays,
    monthDay,
  );
  if (!days.length)
    throw new Error("선택한 기간에 해당하는 수업 날짜가 없습니다.");
  const duration =
    new Date(input.end_at).getTime() - new Date(input.start_at).getTime();
  return days.map((day) => {
    const start_at = parseSeoulDateTime(day + start.slice(10));
    if (!start_at) throw new Error("날짜 범위를 확인해 주세요.");
    const endDate = new Date(new Date(start_at).getTime() + duration);
    if (endDate.getUTCFullYear() > 9999)
      throw new Error("날짜 범위를 확인해 주세요.");
    return { ...input, start_at, end_at: endDate.toISOString() };
  });
}
