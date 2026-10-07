import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { guards, NEXT_VERSION, patchSource, targets } from "./patch-next-rsc-performance.mjs";

describe("version-locked Flight performance source fix", () => {
  it("reapplies idempotently to all six development clients, with only two guards changed", async () => {
    for (const target of targets) {
      expect(target.file).toMatch(/client\.(browser|edge|node)\.development\.js$/);
      const installed = await readFile(`node_modules/next/${target.file}`, "utf8");
      const patched = patchSource(installed, target, NEXT_VERSION);
      expect(patchSource(patched, target, NEXT_VERSION)).toBe(patched);
      const original = guards.reduce((source, { before, after }) => source.replace(after, before), patched);
      expect(createHash("sha256").update(original).digest("hex")).toBe(target.sha256);
      for (const guard of guards) expect(patched.split(guard.after)).toHaveLength(2);
    }
  });

  it("fails closed on unknown versions, modified bytes, duplicate or missing hunks", async () => {
    const target = targets[0];
    const installed = await readFile(`node_modules/next/${target.file}`, "utf8");
    const source = patchSource(installed, target, NEXT_VERSION);
    expect(() => patchSource(source, target, "16.4.0")).toThrow(/Review/);
    for (const invalid of [source + "\n", source + guards[0].before, source.replace(guards[1].after, "if (false)")]) {
      expect(() => patchSource(invalid, target, NEXT_VERSION)).toThrow();
    }
  });

  for (const [index, guard] of guards.entries()) {
    const condition = guard.after.slice(guard.after.indexOf("if (") + 4, -1);
    const end = index === 0 ? "childrenEndTime$jscomp$1" : "childrenEndTime$jscomp$3";
    const track = index === 0 ? "trackIdx$jscomp$1" : "trackIdx$jscomp$4";
    const run = (timestamp, trackIndex, measure, supportsUserTiming = true) => vm.runInNewContext(`if (${condition}) performance.measure("component", {start: 0, end: ${end}});`, { supportsUserTiming, [end]: timestamp, [track]: trackIndex, performance: { measure } });
    it(`${index ? "aborted" : "errored"} tracks skip uninitialized times/out-of-range tracks`, () => {
      const measure = vi.fn();
      for (const value of [-Infinity, -1, NaN]) run(value, 0, measure);
      run(10, 10, measure);
      run(10, 0, measure, false);
      expect(measure).not.toHaveBeenCalled();
    });
    it(`${index ? "aborted" : "errored"} tracks preserve valid measurements and real exceptions`, () => {
      const measure = vi.fn();
      run(0, 0, measure);
      run(20, 9, measure);
      expect(measure).toHaveBeenCalledTimes(2);
      expect(measure.mock.calls[1][1]).toEqual({ start: 0, end: 20 });
      expect(() => run(20, 0, () => { throw new Error("real error"); })).toThrow("real error");
    });
  }
});
