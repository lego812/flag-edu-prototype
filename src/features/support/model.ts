export type Inquiry = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  author_name: string;
  author_email: string | null;
  created_at: string;
  updated_at: string;
};
export type InquiryList = { total: number; items: Omit<Inquiry, "body">[] };
export type InquiryState = { error?: string; savedId?: string };
export function inquiryPage(value?: string | string[]) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1;
}
export function inquiryTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
