import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("mobile README guide", () => {
  it("uses curated complete mobile screenshots with matching hashes", async () => {
    const readme = await readFile("README.md", "utf8");
    const manifest = JSON.parse(await readFile("docs/images/guide-manifest.json", "utf8"));
    const references = [...readme.matchAll(/<img src="docs\/images\/([a-z-]+\.jpg)" width="300" alt="([^"]+)"\s*\/>/g)];
    expect(references).toHaveLength(18);
    expect(new Set(references.map(match => match[1])).size).toBe(18);
    expect(manifest.images).toHaveLength(18);
    expect(manifest.viewport).toEqual({ width: 402, height: 874 });
    expect(manifest.deviceScaleFactor).toBe(3);
    expect(manifest.realDevice).toBe(false);
    expect(manifest.sourceCommit).toMatch(/^[a-f0-9]{40}$/);
    for (const [, file, alt] of references) {
      expect(alt.length).toBeGreaterThan(10);
      const bytes = await readFile(path.join("docs/images", file));
      const metadata = await sharp(bytes).metadata();
      expect(metadata).toMatchObject({ format: "jpeg", width: 1206, height: 2622 });
      expect(metadata.exif).toBeUndefined();
      expect(manifest.images.find(image => image.file === file)?.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
    }
  });

  it("distinguishes current workflow, QA limits and real-device certification", async () => {
    const readme = await readFile("README.md", "utf8");
    expect(readme).toContain("관리자의 전체 조회·편집");
    expect(readme).not.toContain("관리자 확인과 내보내기");
    expect(readme).toContain("미저장 입력은 자동 저장하지 않습니다");
    expect(readme).toContain("새 내보내기에는 서버 저장 이력·재다운로드·7일 보관 기한이 없으며");
    expect(readme).toContain("실제 iPhone 18·iOS 27 Safari");
    expect(readme).not.toContain("coach-report-editor.jpg");
    expect(readme).not.toMatch(/Bearer\s+[A-Za-z0-9_.-]+|eyJ[A-Za-z0-9_-]{40,}|QA-WS-CRUD-\d+/);
  });
});
