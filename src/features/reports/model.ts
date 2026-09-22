export const FIELD_TYPES = {
  short_text: "짧은 글",
  long_text: "긴 글",
  number: "숫자",
  date: "날짜",
  single_select: "단일 선택",
  multi_select: "복수 선택",
  photo: "사진",
} as const;
export type FieldType = keyof typeof FIELD_TYPES;
export type Field = {
  id: string;
  label: string;
  help_text: string | null;
  field_type: FieldType;
  required: boolean;
  sort_order: number;
  settings: { max_files?: number };
  field_options: { id?: string; label: string; sort_order: number }[];
};
export type Template = {
  name: string;
  id: string;
  version: number;
  status: "draft" | "active" | "archived";
  updated_at: string;
  template_fields: Field[];
};
export type Attachment = {
  id: string;
  field_id: string;
  storage_path: string;
  original_filename: string;
  url?: string;
};
export type Report = {
  id: string;
  author_id: string;
  class_session_id: string;
  template_version_id: string;
  status: "draft" | "submitted";
  submitted_at: string | null;
  confirmed_at: string | null;
  updated_at: string;
  class_sessions: {
    has_time?: boolean;
    title: string;
    location: string;
    start_at: string;
    end_at: string;
    status: string;
  };
  profiles: { name: string };
  report_answers: { field_id: string; value: unknown }[];
  report_attachments: Attachment[];
};
export type ActionState = { error?: string; success?: string };
export function reportStatus(report: Pick<Report, "status" | "confirmed_at">) {
  return report.confirmed_at
    ? "확인 완료"
    : report.status === "submitted"
      ? "제출 완료"
      : "미제출";
}
