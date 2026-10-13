import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("role-based README guide", () => {
  it("references current complete screenshots with matching hashes", async () => {
    const readme = await readFile("README.md", "utf8");
    const manifest = JSON.parse(
      await readFile("docs/images/guide-manifest.json", "utf8"),
    );
    const references = [
      ...readme.matchAll(
        /<img src="docs\/images\/([a-z-]+\.jpg)" width="300" alt="([^"]+)"\s*\/>/g,
      ),
    ];
    expect(references.length).toBeGreaterThanOrEqual(20);
    expect(new Set(references.map((match) => match[1])).size).toBe(
      references.length,
    );
    expect(manifest.images).toHaveLength(references.length);
    expect(manifest.base).toBe("https://flag-edu-prototype.vercel.app");
    expect(manifest.viewport).toEqual({ width: 402, height: 874 });
    expect(manifest.deviceScaleFactor).toBe(3);
    expect(manifest.realDevice).toBe(false);
    expect(manifest.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    for (const [, file, alt] of references) {
      expect(alt.length).toBeGreaterThan(10);
      const bytes = await readFile(path.join("docs/images", file));
      expect(await sharp(bytes).metadata()).toMatchObject({
        format: "jpeg",
        width: 1206,
        height: 2622,
      });
      expect((await sharp(bytes).metadata()).exif).toBeUndefined();
      expect(manifest.images.find((image) => image.file === file)?.sha256).toBe(
        createHash("sha256").update(bytes).digest("hex"),
      );
    }
  });

  it("keeps the requested chapter order and all local document links usable", async () => {
    const readme = await readFile("README.md", "utf8");
    expect(
      [...readme.split("<!-- USER_GUIDE_END -->")[0].matchAll(/^## (.+)$/gm)].map((match) => match[1]),
    ).toEqual([
      "1. 개요 및 용어정리",
      "2. 공통기능 — 회원가입 및 로그인",
      "3. 코치 기능",
      "4. 관리자 기능",
    ]);
    for (const [, target] of readme.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^https?:/.test(target)) continue;
      if (target.startsWith("#"))
        expect(readme).toContain(`id="${target.slice(1)}"`);
      else expect((await readFile(target)).length).toBeGreaterThan(0);
    }
    const pdf = await readFile("docs/Flag-Edu-User-Guide.pdf");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(100_000);
    expect(readme).not.toMatch(
      /Bearer\s+[A-Za-z0-9_.-]+|eyJ[A-Za-z0-9_-]{40,}|QA-WS-CRUD-\d+/,
    );
  });
});
