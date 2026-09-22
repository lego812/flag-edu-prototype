export async function compressPhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024)
    throw new Error("25MB 이하의 사진을 선택해 주세요.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(
      1,
      1600 / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("사진을 처리할 수 없습니다.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= 400 * 1024) break;
    }
    if (!blob || blob.size > 1048576)
      throw new Error(
        "사진이 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.",
      );
    return blob;
  } catch (e) {
    throw new Error(
      e instanceof Error && e.message.includes("사진")
        ? e.message
        : "사진을 읽지 못했습니다. JPG 또는 PNG로 다시 선택해 주세요.",
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
