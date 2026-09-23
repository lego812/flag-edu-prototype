import type { Field } from "./model";
import { CountPicker } from "@/components/count-picker";
export function FieldInput({
  field: f,
  value,
  disabled = false,
  onChange,
}: {
  field: Field;
  value?: unknown;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const label = (
    <span className="mb-4 block text-lg font-bold tracking-tight">
      {f.label}
      {f.required && " *"}
    </span>
  );
  if (
    f.field_type === "number" &&
    /인원|개수|수량|횟수|인수|명|개/.test(f.label)
  )
    return (
      <div>
        {label}
        <CountPicker
          name={f.id}
          label={f.label}
          defaultValue={String(value ?? "")}
          onChange={onChange}
          disabled={disabled}
          placeholder={f.help_text || "선택"}
        />
      </div>
    );
  if (f.field_type === "photo")
    return (
      <div>
        {label}
        <p className="text-sm text-neutral-600">
          사진 최대 {f.settings.max_files ?? 3}장
        </p>
      </div>
    );
  if (f.field_type === "multi_select")
    return (
      <fieldset disabled={disabled}>
        <legend className="text-lg font-bold tracking-tight">
          {f.label}
          {f.required && " *"}
        </legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {f.field_options.map((o) => (
            <label
              key={o.label}
              className="flex min-h-12 items-center gap-3 rounded-2xl bg-white px-4 py-3"
            >
              <input
                type="checkbox"
                name={f.id}
                value={o.label}
                defaultChecked={Array.isArray(value) && value.includes(o.label)}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
    );
  return (
    <label className="block">
      {label}
      {f.field_type === "long_text" ? (
        <textarea
          className="input min-h-48 border-0 p-5 leading-8"
          rows={6}
          name={f.id}
          placeholder={f.help_text || undefined}
          maxLength={20000}
          defaultValue={String(value ?? "")}
          disabled={disabled}
        />
      ) : f.field_type === "single_select" ? (
        <select
          className="input"
          name={f.id}
          defaultValue={String(value ?? "")}
          disabled={disabled}
        >
          <option value="">{f.help_text || "선택해 주세요"}</option>
          {f.field_options.map((o) => (
            <option key={o.label}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          name={f.id}
          placeholder={f.help_text || undefined}
          type={
            f.field_type === "number"
              ? "number"
              : f.field_type === "date"
                ? "date"
                : "text"
          }
          step={f.field_type === "number" ? "any" : undefined}
          maxLength={20000}
          defaultValue={String(value ?? "")}
          disabled={disabled}
        />
      )}{" "}
    </label>
  );
}
