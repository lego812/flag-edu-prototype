// @vitest-environment node
import { describe, it, expect } from "vitest";
import { makePrompt, parseOptions, runCli } from "./aside-qa.mjs";

describe("Aside QA options and scope", () => {
  it("defaults to read-only local smoke testing", () => {
    expect(parseOptions([])).toMatchObject({
      scenario: "smoke",
      url: "http://localhost:3000",
      allowWrites: false,
    });
  });
  it("requires an explicit write flag for workflow and rejects contradictory flags", () => {
    expect(() => parseOptions(["--scenario", "workflow"])).toThrow(
      "--allow-writes",
    );
    expect(
      parseOptions(["--scenario", "workflow", "--allow-writes"]),
    ).toMatchObject({ allowWrites: true });
    expect(() => parseOptions(["--allow-writes"])).toThrow("조회 전용");
  });
  it.each([
    "file:///etc/passwd",
    "https://name:secret@example.com",
    "http://localhost:3000/?token=secret",
    "http://localhost:3000/path",
  ])("rejects unsafe target %s", (url) => {
    expect(() => parseOptions(["--url", url])).toThrow();
  });
  it("rejects unknown scenarios, options and unbounded timeouts", () => {
    expect(() => parseOptions(["--scenario", "../../secret"])).toThrow();
    expect(() => parseOptions(["--full-access"])).toThrow();
    expect(() => parseOptions(["--timeout", "NaN"])).toThrow();
    expect(() => parseOptions(["--timeout", "0"])).toThrow();
    expect(() => parseOptions(["--url"])).toThrow();
  });
  it("puts the target, unique data prefix and evidence rules into the prompt", () => {
    const prompt = makePrompt(parseOptions([]), "S01: 홈", "run-123");
    expect(prompt).toContain("http://localhost:3000");
    expect(prompt).toContain("QA-run-123");
    expect(prompt).toContain("조회 전용");
    expect(prompt).toContain("S01: 홈");
    expect(prompt).toContain("BLOCKED");
  });
});

describe("Aside QA process wrapper (no browser invocation)", () => {
  it("captures output and CLI success without assigning a test verdict", async () => {
    const result = await runCli(
      process.execPath,
      ["-e", "console.log('한글 PASS');console.error('diagnostic')"],
      { timeout: 5 },
    );
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("한글 PASS");
    expect(result.stderr).toContain("diagnostic");
    expect(result).not.toHaveProperty("passed");
  });
  it("records nonzero exits", async () => {
    const result = await runCli(process.execPath, ["-e", "process.exit(7)"], {
      timeout: 5,
    });
    expect(result.code).toBe(7);
  });
  it("reports a missing executable", async () => {
    const result = await runCli("aside-nonexistent-test-binary", [], {
      timeout: 5,
    });
    expect(result.error).toContain("ENOENT");
  });
  it("times out instead of waiting indefinitely", async () => {
    const result = await runCli(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { timeout: 0.2 },
    );
    expect(result.timedOut).toBe(true);
  });
});
