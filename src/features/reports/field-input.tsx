import type { Field } from "./model";
export function FieldInput({
  field: f,
  value,
  disabled = false,
}: {
  field: Field;
  value?: unknown;
  disabled?: boolean;
}) {
  const label = (
    <span className="mb-2 block text-sm font-semibold">
      {f.label}
      {f.required && " *"}
    </span>
  );
  const help = f.help_text && (
    <span className="mt-1 block text-sm text-neutral-600">{f.help_text}</span>
  );
  if (f.field_type === "photo")
    return (
      <div>
        {label}
        <p className="text-sm text-neutral-600">
          사진 최대 {f.settings.max_files ?? 3}장
        </p>
        {help}
      </div>
    );
  if (f.field_type === "multi_select")
    return (
      <fieldset disabled={disabled}>
        <legend className="text-sm font-semibold">
          {f.label}
          {f.required && " *"}
        </legend>
        <div className="mt-2 flex flex-wrap gap-4">
          {f.field_options.map((o) => (
            <label key={o.label} className="flex min-h-11 items-center gap-2">
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
        {help}
      </fieldset>
    );
  return (
    <label className="block">
      {label}
      {f.field_type === "long_text" ? (
        <textarea
          className="input"
          rows={4}
          name={f.id}
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
          <option value="">선택해 주세요</option>
          {f.field_options.map((o) => (
            <option key={o.label}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          className="input"
          name={f.id}
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
      {help}
    </label>
  );
}
