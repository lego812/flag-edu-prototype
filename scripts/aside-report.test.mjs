// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { analyzeResult, caseIdsFromMarkdown } from "./aside-report.mjs";
const snapshot = {
  runId: "run-1",
  sourceCommit: "abc",
  caseIds: ["1-a-A", "1-a-B", "1-b-A"],
  coverage: {
    requirements: [
      {
        id: "R01",
        cases: ["1-a-A", "1-a-B", "1-b-A", "1-d-A"],
        gaps: ["실기기"],
      },
    ],
  },
};
const row = (id, status = "PASS") => ({
  id,
  status,
  actual: "관찰",
  evidence: [],
  steps: [],
});
const output = (data) =>
  `BEGIN_FLAG_EDU_QA_RESULT\n${JSON.stringify(data)}\nEND_FLAG_EDU_QA_RESULT`;
const payload = (cases) => ({ runId: "run-1", cases, improvements: [] });
describe("hierarchical cases and strict QA report handling", () => {
  it("reads only leaf rows including fourth-level branches", () => {
    expect(
      caseIdsFromMarkdown("## 1-a\n| 1-a-A | x |\n| 1-a-B-1 | y |\n"),
    ).toEqual(["1-a-A", "1-a-B-1"]);
    expect(() => caseIdsFromMarkdown("| 1-a-A | x |\n| 1-a-A | y |")).toThrow();
  });
  it("never derives test success from CLI success text", () => {
    const r = analyzeResult("all passed exit 0", snapshot);
    expect(r.counts.NOT_RUN).toBe(3);
    expect(r.formatError).toBeTruthy();
    expect(r.verdict).toBe("REVIEW_REQUIRED");
  });
  it("keeps BLOCKED and omitted cases outside observed coverage", () => {
    const r = analyzeResult(
      output(payload([row("1-a-A"), row("1-a-B", "BLOCKED")])),
      snapshot,
    );
    expect(r.counts).toEqual({ PASS: 1, FAIL: 0, BLOCKED: 1, NOT_RUN: 1 });
    expect(r.coverage.observed).toBe(1);
    expect(r.coverage.totalPlanned).toBe(4);
    expect(r.coverage.branches.find((b) => b.id === "1-a")).toMatchObject({
      selected: 2,
      observed: 1,
      passed: 1,
      blocked: 1,
    });
  });
  it.each([
    { runId: "another-run", cases: [], improvements: [] },
    payload([row("1-a-A"), row("1-a-A")]),
    payload([row("9-z-Z")]),
    payload([row("1-a-A", "DONE")]),
    payload([{ ...row("1-a-A"), actual: "" }]),
  ])("fails closed for invalid or mismatched observations", (data) => {
    const r = analyzeResult(output(data), snapshot);
    expect(r.formatError).toBeTruthy();
    expect(r.counts.NOT_RUN).toBe(3);
  });
  it("accepts repeated results only when every case verdict agrees", () => {
    const first = output(payload([row("1-a-A")]));
    const same = output(payload([{ ...row("1-a-A"), actual: "재확인" }]));
    const different = output(payload([row("1-a-A", "FAIL")]));
    expect(analyzeResult(first + "\n" + same, snapshot).counts.PASS).toBe(1);
    expect(
      analyzeResult(first + "\nBEGIN_FLAG_EDU_QA_RESULT\n{", snapshot)
        .counts.PASS,
    ).toBe(1);
    expect(analyzeResult(first + "\n" + different, snapshot).formatError).toBeTruthy();
  });
  it("accepts a single result block with CLI color codes on the marker", () => {
    const colored = `${output(payload([row("1-a-A")]))}\u001b[0m`;
    const r = analyzeResult(colored, snapshot);
    expect(r.formatError).toBeNull();
    expect(r.counts.PASS).toBe(1);
  });
  it("separates suggested improvements from observed bugs", () => {
    const r = analyzeResult(
      output({
        ...payload([row("1-a-A", "FAIL")]),
        improvements: [{ caseId: "1-a-B", description: "새 색상 제안" }],
      }),
      snapshot,
    );
    expect(r.counts.FAIL).toBe(1);
    expect(r.improvements).toHaveLength(1);
  });
  it("maps every unique planned case to its requirement and existing automated tests", async () => {
    const coverage = JSON.parse(
      await readFile("qa/aside/coverage.json", "utf8"),
    );
    const all = [];
    for (const name of ["smoke", "workflow", "manual"])
      all.push(
        ...caseIdsFromMarkdown(await readFile(`qa/aside/${name}.md`, "utf8")),
      );
    expect(all.length).toBe(94);
    expect(new Set(all).size).toBe(all.length);
    const mapped = coverage.requirements.flatMap((r) => r.cases);
    expect(mapped.sort()).toEqual([...all].sort());
    for (const requirement of coverage.requirements)
      for (const file of requirement.automated)
        await expect(access(file)).resolves.toBeUndefined();
  });
});
