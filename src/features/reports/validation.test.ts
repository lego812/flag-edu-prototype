import { describe, it, expect } from "vitest";
import { parseAnswers, validateFields } from "./validation";
import { reportFilters } from "./repository";
import type { Field } from "./model";
const field: Field = {
  id: "f",
  label: "항목",
  help_text: null,
  field_type: "short_text",
  required: true,
  sort_order: 0,
  settings: {},
  field_options: [],
};
describe("report validation", () => {
  it("allows incomplete drafts but refuses empty required submissions", () => {
    expect(parseAnswers([field], new FormData(), false, {})).toEqual([
      { fieldId: "f", value: null },
    ]);
    expect(() => parseAnswers([field], new FormData(), true, {})).toThrow(
      "필수",
    );
  });
  it("preserves zero and rejects invalid numbers", () => {
    const form = new FormData();
    form.set("f", "0");
    expect(
      parseAnswers([{ ...field, field_type: "number" }], form, true, {})[0]
        .value,
    ).toBe(0);
    form.set("f", "Infinity");
    expect(() =>
      parseAnswers([{ ...field, field_type: "number" }], form, true, {}),
    ).toThrow();
  });
  it("validates real calendar dates", () => {
    const form = new FormData();
    form.set("f", "2026-02-30");
    expect(() =>
      parseAnswers([{ ...field, field_type: "date" }], form, true, {}),
    ).toThrow();
  });
  it("rejects forged options", () => {
    const form = new FormData();
    form.set("f", "other");
    expect(() =>
      parseAnswers(
        [
          {
            ...field,
            field_type: "single_select",
            field_options: [{ label: "yes", sort_order: 0 }],
          },
        ],
        form,
        true,
        {},
      ),
    ).toThrow();
  });
  it("validates required photos and maximum count", () => {
    const photo = {
      ...field,
      field_type: "photo" as const,
      settings: { max_files: 3 },
    };
    expect(() => parseAnswers([photo], new FormData(), true, {})).toThrow();
    expect(() =>
      parseAnswers([photo], new FormData(), false, { f: 4 }),
    ).toThrow();
  });
  it("rejects duplicate options and invalid template bounds", () => {
    expect(validateFields([])).toBeTruthy();
    expect(
      validateFields([
        {
          label: "선택",
          help_text: "",
          field_type: "single_select",
          required: false,
          options: ["A", "A"],
        },
      ]),
    ).toBeTruthy();
    expect(
      validateFields([
        {
          label: "사진",
          help_text: "",
          field_type: "photo",
          required: false,
          max_files: 3,
        },
      ]),
    ).toBeNull();
  });
  it("rejects invalid filters and author IDs", () => {
    expect(() => reportFilters({ author: "fake" })).toThrow();
    expect(() =>
      reportFilters({ from: "2026-12-01", to: "2026-01-01" }),
    ).toThrow();
    expect(() => reportFilters({ page: "1.1" })).toThrow();
    expect(reportFilters({}).page).toBe(1);
  });
});
