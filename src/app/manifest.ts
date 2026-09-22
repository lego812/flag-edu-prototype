import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Flag Edu 코치 수업 보고",
    short_name: "Flag Edu",
    description: "코치 수업 보고와 관리자 확인을 위한 업무 앱",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f3f2",
    theme_color: "#f3f3f2",
    lang: "ko-KR",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
