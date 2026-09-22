import { describe, it, expect } from "vitest";
import { occurrenceDates, buildSchedule } from "./recurrence";
import { parseClassForm } from "./validation";
import { formatClassDate } from "./dates";
describe("class recurrence", () => {
  it("creates daily intervals inclusively", () => {
    expect(occurrenceDates("2026-09-22", "day", 2, "2026-09-28")).toEqual([
      "2026-09-22",
      "2026-09-24",
      "2026-09-26",
      "2026-09-28",
    ]);
  });
  it("selects multiple weekdays in every second Monday-based week", () => {
    expect(
      occurrenceDates("2026-09-22", "week", 2, "2026-10-09", [1, 3, 5]),
    ).toEqual([
      "2026-09-23",
      "2026-09-25",
      "2026-10-05",
      "2026-10-07",
      "2026-10-09",
    ]);
  });
  it("requires a weekday for weekly schedules", () => {
    expect(() =>
      occurrenceDates("2026-09-22", "week", 1, "2026-10-22", []),
    ).toThrow("요일");
  });
  it("clamps monthly dates without drifting the following month", () => {
    expect(
      occurrenceDates("2028-01-31", "month", 1, "2028-03-31", [], 31),
    ).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
  it("skips monthly dates before the start", () => {
    expect(
      occurrenceDates("2026-09-22", "month", 1, "2026-11-05", [], 5),
    ).toEqual(["2026-10-05", "2026-11-05"]);
  });
  it("enforces finite intervals, ordered dates and batch limits", () => {
    expect(() =>
      occurrenceDates("2026-09-22", "day", 0, "2026-10-22"),
    ).toThrow();
    expect(() =>
      occurrenceDates("2026-09-22", "day", 1, "2026-01-01"),
    ).toThrow();
    expect(() => occurrenceDates("2026-01-01", "day", 1, "2028-01-01")).toThrow(
      "366",
    );
    expect(occurrenceDates("2028-01-01", "day", 1, "2028-12-31")).toHaveLength(
      366,
    );
  });
  it("stores unspecified time as a date-only KST range and never displays midnight", () => {
    const f = new FormData();
    Object.entries({
      title: "수업",
      location: "센터",
      start: "2026-09-22",
      has_time: "false",
    }).forEach(([k, v]) => f.set(k, v));
    const p = parseClassForm(f);
    if (!("input" in p)) throw Error("parse failed");
    expect(p.input.has_time).toBe(false);
    expect(p.input.start_at).toBe("2026-09-21T15:00:00.000Z");
    expect(p.input.end_at).toBe("2026-09-22T15:00:00.000Z");
    expect(formatClassDate(p.input.start_at, false)).toContain("시간 미정");
    expect(formatClassDate(p.input.start_at, false)).not.toContain("00:00");
    expect(buildSchedule(p.input, "day", 1, "2026-09-24")).toHaveLength(3);
  });
  it("preserves an overnight timed duration", () => {
    const items = buildSchedule(
      {
        title: "수업",
        location: "센터",
        memo: null,
        has_time: true,
        start_at: "2026-09-22T14:00:00Z",
        end_at: "2026-09-22T16:00:00Z",
      },
      "day",
      1,
      "2026-09-23",
    );
    expect(items[1].start_at).toBe("2026-09-23T14:00:00.000Z");
    expect(items[1].end_at).toBe("2026-09-23T16:00:00.000Z");
  });
});
