const KST_OFFSET = 9 * 60 * 60 * 1000;

// Interpret all form dates in Asia/Seoul, regardless of browser/server timezone.
export function parseSeoulDateTime(value: string): string | null {
  if (!/^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value + ":00+09:00");
  if (!Number.isFinite(date.getTime())) return null;
  return toSeoulInput(date.toISOString()) === value ? date.toISOString() : null;
}

export function toSeoulInput(utc: string) {
  return new Date(new Date(utc).getTime() + KST_OFFSET).toISOString().slice(0, 16);
}

export function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && parseSeoulDateTime(value + "T00:00") !== null;
}

export function seoulToday(now = new Date()) {
  return toSeoulInput(now.toISOString()).slice(0, 10);
}

export function addDays(day: string, count: number) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

export function formatClassDate(utc: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric",
    weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(utc));
}
