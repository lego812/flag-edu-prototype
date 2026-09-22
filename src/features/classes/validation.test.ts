import { describe, expect, it } from "vitest";
import { parseSeoulDateTime, seoulToday, toSeoulInput } from "./dates";
import { parseClassFilters, parseClassForm } from "./validation";
import { canManageClass, type ClassSession } from "./model";

export const formData = () => {
  const form = new FormData();
  Object.entries({ title: " 체육 수업 ", location: "돌봄센터", start: "2026-09-22T14:00", end: "2026-09-22T15:00", memo: "" }).forEach(([key, value]) => form.set(key, value));
  return form;
};
describe("Korean class dates and validation", () => {
  it("converts Korean input to UTC and restores it", () => {
    expect(parseSeoulDateTime("2026-09-22T00:30")).toBe("2026-09-21T15:30:00.000Z");
    expect(toSeoulInput("2026-09-21T15:30:00Z")).toBe("2026-09-22T00:30");
    expect(seoulToday(new Date("2026-09-21T15:30:00Z"))).toBe("2026-09-22");
  });
  it.each(["2026-02-30T10:00", "2026-09-22T24:00", "2026-13-01T10:00", "garbage"])("rejects invalid date %s", value => {
    expect(parseSeoulDateTime(value)).toBeNull();
  });
  it("accepts leap day only in a leap year", () => {
    expect(parseSeoulDateTime("2024-02-29T10:00")).not.toBeNull();
    expect(parseSeoulDateTime("2026-02-29T10:00")).toBeNull();
  });
  it("trims values and clears an empty memo", () => {
    const parsed = parseClassForm(formData());
    expect(parsed).toMatchObject({ input: { title: "체육 수업", memo: null, start_at: "2026-09-22T05:00:00.000Z" } });
  });
  it.each(["2026-09-22T14:00", "2026-09-22T13:00"])("rejects nonpositive periods", end => {
    const form = formData(); form.set("end", end);
    expect(parseClassForm(form)).toMatchObject({ state: { fieldErrors: { end: expect.any(String) } } });
  });
  it("rejects blank and oversized required fields", () => {
    const form = formData(); form.set("title", " "); form.set("location", "가".repeat(201));
    expect(parseClassForm(form)).toMatchObject({ state: { fieldErrors: { title: expect.any(String), location: expect.any(String) } } });
  });
  it("rejects invalid filter dates, status and page", () => {
    for (const params of [{ from: "2026-02-30" }, { from: "2026-10-01", to: "2026-09-01" }, { status: "unknown" }, { page: "0" }, { from: ["2026-01-01"] }]) {
      expect(parseClassFilters(params).error).toBeDefined();
    }
  });
});
describe("class modification permissions", () => {
  const session = { organization_id: "org", created_by: "owner" } as ClassSession;
  it("allows creator and same-organization admin only", () => {
    expect(canManageClass({ id: "owner", organization_id: "org", role: "coach", status: "active" }, session)).toBe(true);
    expect(canManageClass({ id: "other", organization_id: "org", role: "admin", status: "active" }, session)).toBe(true);
    expect(canManageClass({ id: "other", organization_id: "org", role: "coach", status: "active" }, session)).toBe(false);
    expect(canManageClass({ id: "other", organization_id: "else", role: "admin", status: "active" }, session)).toBe(false);
    expect(canManageClass({ id: "owner", organization_id: "org", role: "admin", status: "inactive" }, session)).toBe(false);
  });
});
