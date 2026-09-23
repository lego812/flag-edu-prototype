import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const dir = path.join(root, "artifacts", "aside", "fixtures");
await mkdir(dir, { recursive: true });

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#f3f3f3"/><circle cx="320" cy="240" r="100" fill="#f4d35e"/><text x="320" y="430" text-anchor="middle" font-size="32" fill="#222">QA TEST</text></svg>',
);
await sharp(svg).jpeg({ quality: 85 }).toFile(path.join(dir, "qa-photo.jpg"));
await sharp(svg).png().toFile(path.join(dir, "qa-photo.png"));
console.log("비개인 합성 JPEG/PNG fixture를 artifacts/aside/fixtures/에 생성했습니다.");
