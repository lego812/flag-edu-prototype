import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { FieldInput } from "./field-input";
import type { Field } from "./model";
const field: Field = {
  id: "question",
  label: "참여 인원",
  help_text: "코치를 제외합니다.",
  field_type: "number",
  required: true,
  sort_order: 0,
  settings: {},
  field_options: [],
};
describe("dynamic field renderer", () => {
  it("renders an accessible count picker preserving zero", () => {
    render(<FieldInput field={field} value={0} />);
    expect(screen.getByRole("button", { name: /참여 인원/ })).toHaveTextContent(
      "0",
    );
  });
  it("renders all selected multi-select options", () => {
    render(
      <FieldInput
        field={{
          ...field,
          field_type: "multi_select",
          field_options: [
            { label: "A", sort_order: 0 },
            { label: "B", sort_order: 1 },
          ],
        }}
        value={["B"]}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "A" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "B" })).toBeChecked();
  });
  it("disables preview inputs", () => {
    render(
      <FieldInput field={{ ...field, field_type: "long_text" }} disabled />,
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
  it("omits placeholder text when help text is absent", () => {
    render(
      <FieldInput
        field={{ ...field, field_type: "long_text", help_text: null }}
      />,
    );
    expect(screen.getByRole("textbox")).not.toHaveAttribute("placeholder");
  });
});
