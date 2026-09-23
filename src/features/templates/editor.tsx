"use client";
import { CountPicker } from "@/components/count-picker";
import { useActionState, useState } from "react";
import {
  FIELD_TYPES,
  type FieldType,
  type Template,
} from "@/features/reports/model";
import { FieldInput } from "@/features/reports/field-input";
import { saveTemplateAction } from "./actions";
type Editable = {
  key: string;
  label: string;
  help_text: string;
  field_type: FieldType;
  required: boolean;
  max_files: number;
  options: string;
};
const blank = (): Editable => ({
  key: crypto.randomUUID(),
  label: "",
  help_text: "",
  field_type: "short_text",
  required: false,
  max_files: 3,
  options: "",
});
export function TemplateEditor({ template }: { template?: Template }) {
  const [fields, setFields] = useState<Editable[]>(
    () =>
      template?.template_fields.map((f) => ({
        key: f.id,
        label: f.label,
        help_text: f.help_text ?? "",
        field_type: f.field_type,
        required: f.required,
        max_files: f.settings.max_files ?? 3,
        options: f.field_options.map((o) => o.label).join("\n"),
      })) ?? [],
  );
  const [preview, setPreview] = useState(false);
  const [name, setName] = useState(template?.name ?? "보고서 양식");
  const [state, action, pending] = useActionState(saveTemplateAction, {});
  const update = (i: number, patch: Partial<Editable>) =>
    setFields(fields.map((f, index) => (index === i ? { ...f, ...patch } : f)));
  const move = (i: number, by: number) => {
    const next = [...fields];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    setFields(next);
  };
  const payload = fields.map((f) => ({
    ...f,
    options: f.options
      .split("\n")
      .map((v) => v.trim())
      .filter(Boolean),
  }));
  return (
    <form action={action} className="max-w-2xl space-y-6">
      <input
        type="hidden"
        name="id"
        value={template?.status === "draft" ? template.id : ""}
      />
      <input
        type="hidden"
        name="version"
        value={template?.status === "draft" ? template.updated_at : ""}
      />
      <input type="hidden" name="fields" value={JSON.stringify(payload)} />
      <p className="text-sm text-neutral-600">
        게시된 내용은 변경하지 않고 새 버전으로 저장합니다.
      </p>
      <fieldset disabled={pending} className="space-y-6">
        <label className="block text-sm font-semibold">
          양식 이름
          <input
            className="input mt-2"
            name="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setPreview(!preview)}
        >
          {preview ? "편집으로 돌아가기" : "미리보기"}
        </button>
        {fields.map((f, i) => (
          <section
            key={f.key}
            className="space-y-3 border-b border-neutral-200 pb-6"
          >
            {preview ? (
              <FieldInput
                field={{
                  ...f,
                  id: f.key,
                  sort_order: i,
                  settings: { max_files: f.max_files },
                  field_options: payload[i].options.map(
                    (label, sort_order) => ({ label, sort_order }),
                  ),
                }}
                disabled
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="mr-auto font-semibold">항목 {i + 1}</span>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    위로
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={i === fields.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    아래로
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setFields(fields.filter((_, n) => n !== i))}
                  >
                    삭제
                  </button>
                </div>
                <label className="block text-sm">
                  항목명
                  <input
                    className="input mt-1"
                    maxLength={100}
                    value={f.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  입력 유형
                  <select
                    className="input mt-1"
                    value={f.field_type}
                    onChange={(e) =>
                      update(i, { field_type: e.target.value as FieldType })
                    }
                  >
                    {Object.entries(FIELD_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  도움말
                  <input
                    className="input mt-1"
                    maxLength={300}
                    value={f.help_text}
                    onChange={(e) => update(i, { help_text: e.target.value })}
                  />
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={f.required}
                    onChange={(e) => update(i, { required: e.target.checked })}
                  />
                  필수 항목
                </label>
                {["single_select", "multi_select"].includes(f.field_type) && (
                  <label className="block text-sm">
                    선택지 (한 줄에 하나)
                    <textarea
                      className="input mt-1"
                      value={f.options}
                      onChange={(e) => update(i, { options: e.target.value })}
                    />
                  </label>
                )}
                {f.field_type === "photo" && (
                  <div className="block text-sm">
                    최대 사진 수
                    <CountPicker
                      label="최대 사진 수"
                      min={1}
                      max={10}
                      value={String(f.max_files)}
                      onChange={(value) =>
                        update(i, { max_files: Number(value) })
                      }
                    />
                  </div>
                )}
              </>
            )}
          </section>
        ))}
        {!preview && (
          <button
            type="button"
            className="btn-secondary"
            disabled={fields.length >= 50}
            onClick={() => setFields([...fields, blank()])}
          >
            항목 추가
          </button>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" />
          게시하면 새 보고서에 이 양식을 사용합니다.
        </label>
        <div className="flex gap-3">
          <button className="btn-secondary" name="intent" value="save">
            초안 저장
          </button>
          <button className="btn" name="intent" value="publish">
            저장 후 게시
          </button>
        </div>
      </fieldset>
      {state.error && (
        <p role="alert" className="text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
