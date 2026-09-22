import { isDate } from "@/features/classes/dates";
import { FIELD_TYPES, type Field } from "./model";

export function validateFields(value: unknown): string | null {
  if (!Array.isArray(value) || !value.length || value.length > 50)
    return "항목은 1~50개로 구성해 주세요.";
  for (const field of value) {
    if (
      !field ||
      typeof field.label !== "string" ||
      !field.label.trim() ||
      field.label.length > 100
    )
      return "항목명은 1~100자로 입력해 주세요.";
    if (typeof field.help_text !== "string" || field.help_text.length > 300)
      return "도움말은 300자 이하로 입력해 주세요.";
    if (
      !Object.hasOwn(FIELD_TYPES, field.field_type) ||
      typeof field.required !== "boolean"
    )
      return "항목 유형을 확인해 주세요.";
    if (
      field.field_type === "photo" &&
      (!Number.isInteger(field.max_files) ||
        field.max_files < 1 ||
        field.max_files > 10)
    )
      return "사진 수는 1~10장으로 설정해 주세요.";
    if (["single_select", "multi_select"].includes(field.field_type)) {
      if (
        !Array.isArray(field.options) ||
        !field.options.length ||
        field.options.length > 50 ||
        field.options.some(
          (o: unknown) => typeof o !== "string" || !o.trim() || o.length > 100,
        ) ||
        new Set(field.options).size !== field.options.length
      )
        return "선택지는 중복 없이 1~50개, 각 100자 이하로 입력해 주세요.";
    }
  }
  return null;
}

export function parseAnswers(
  fields: Field[],
  form: FormData,
  submit: boolean,
  counts: Record<string, number>,
) {
  const answers: { fieldId: string; value: unknown }[] = [];
  for (const f of fields) {
    if (f.field_type === "photo") {
      if (submit && f.required && !counts[f.id])
        throw new Error(`${f.label}: 사진을 첨부해 주세요.`);
      if ((counts[f.id] ?? 0) > (f.settings.max_files ?? 3))
        throw new Error(`${f.label}: 사진 수가 초과되었습니다.`);
      continue;
    }
    const raw = form.get(f.id);
    let value: unknown =
      f.field_type === "multi_select"
        ? form.getAll(f.id).map(String)
        : typeof raw === "string"
          ? raw.trim()
          : "";
    const empty = value === "" || (Array.isArray(value) && value.length === 0);
    if (empty) {
      if (submit && f.required) throw new Error(`${f.label}: 필수 항목입니다.`);
      value = null;
    } else {
      if (typeof value === "string" && value.length > 20000)
        throw new Error(`${f.label}: 20,000자 이하로 입력해 주세요.`);
      if (f.field_type === "number") {
        value = Number(value);
        if (!Number.isFinite(value))
          throw new Error(`${f.label}: 숫자를 입력해 주세요.`);
      }
      if (f.field_type === "date" && !isDate(String(value)))
        throw new Error(`${f.label}: 날짜를 확인해 주세요.`);
      if (["single_select", "multi_select"].includes(f.field_type)) {
        const selected = Array.isArray(value) ? value : [value];
        if (selected.some((v) => !f.field_options.some((o) => o.label === v)))
          throw new Error(`${f.label}: 선택지를 확인해 주세요.`);
      }
    }
    answers.push({ fieldId: f.id, value });
  }
  return answers;
}
