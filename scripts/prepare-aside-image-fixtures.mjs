import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const sessionArg = process.argv.indexOf("--aside-session");
const sessionId = sessionArg >= 0 ? process.argv[sessionArg + 1] : null;
if (sessionArg >= 0 && !/^\d{4}-\d{2}-\d{2}_[A-Za-z0-9]+$/.test(sessionId || "")) {
  throw new Error("올바른 Aside 세션 ID를 --aside-session 뒤에 지정하세요.");
}
const dir = sessionId
  ? path.join(process.env.USERPROFILE, ".aside", "u", "0", "sessions", sessionId, "tmp")
  : path.join(root, "artifacts", "aside", "fixtures");
await mkdir(dir, { recursive: true });

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#f3f3f3"/><circle cx="320" cy="240" r="100" fill="#f4d35e"/><text x="320" y="430" text-anchor="middle" font-size="32" fill="#222">QA TEST</text></svg>',
);
await sharp(svg).jpeg({ quality: 85 }).toFile(path.join(dir, "qa-photo.jpg"));
await sharp(svg).png().toFile(path.join(dir, "qa-photo.png"));
console.log(`비개인 합성 JPEG/PNG fixture를 ${dir}에 생성했습니다.`);
