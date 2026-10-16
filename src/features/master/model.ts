import type { Field, Report } from "@/features/reports/model";
export type Params = Record<string, string | string[] | undefined>;
export const sections = {
  courses: "수업",
  sessions: "수업 일정",
  reports: "보고서",
  members: "참여자·권한",
  templates: "보고서 양식",
} as const;
export type Section = keyof typeof sections;
export function queryParams(params: Params) {
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const n = typeof params.page === "string" ? Number(params.page) : 1;
  const page = Number.isInteger(n) && n >= 1 && n <= 100000 ? n : 1;
  const section: Section =
    typeof params.section === "string" &&
    Object.hasOwn(sections, params.section)
      ? (params.section as Section)
      : "courses";
  return { q, page, section };
}
export type Workspace = { id: string; name: string; created_at?: string };
export type UserItem = {
  id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  consent: "accepted" | "legacy_exempt" | "pending";
  accepted_at: string | null;
  policy_version: string | null;
  memberships: (Workspace & { role: "admin" | "coach"; status: string })[];
};
export type UserDashboard = {
  total: number;
  stats: { total: number; recent: number; without_workspace: number };
  items: UserItem[];
};
export type WorkspaceRow = {
  id: string;
  title?: string;
  name?: string;
  location?: string;
  teaching_method?: string | null;
  memo?: string | null;
  active?: boolean;
  has_time?: boolean;
  start_at?: string;
  end_at?: string;
  created_at?: string;
  status?: string;
  author?: string;
  role?: string;
  version?: number;
  fields?: (Pick<
    Field,
    "id" | "label" | "field_type" | "required" | "help_text" | "settings"
  > & { options: string[] })[];
};
export type WorkspaceDetail = {
  workspace: Workspace;
  total: number;
  items: WorkspaceRow[];
};
export type MasterReport = {
  workspace: Workspace;
  report: Report;
  fields: Field[];
};
export function dateTime(value?: string | null, time = true) {
  if (!value) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    ...(time ? { timeStyle: "short" as const } : {}),
  }).format(new Date(value));
}
export const statusLabel: Record<string, string> = {
  active: "활성",
  inactive: "비활성",
  pending: "대기",
  scheduled: "예정",
  completed: "완료",
  cancelled: "취소",
  draft: "임시저장",
  submitted: "제출",
  archived: "보관",
};
