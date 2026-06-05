const ACCEPTED = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const COMPRESS_THRESHOLD = 3 * 1024 * 1024;
const COMPRESS_QUALITY = 0.7;
const MAX_DIMENSION = 2000;

export type ProcessedImage = {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
  originalBytes: number;
  compressed: boolean;
  mime: string;
  name: string;
};

export function validateImageFile(file: File): string | null {
  const type = file.type.toLowerCase();
  const okType =
    ACCEPTED.includes(type) ||
    /\.(jpe?g|png|webp)$/i.test(file.name);
  if (!okType) return "Unsupported format. Use JPG, PNG, or WEBP.";
  if (file.size > MAX_INPUT_BYTES) return "Image is too large. Max 10MB.";
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function readFileAsDataUrl(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    reader.onload = () => {
      onProgress?.(100);
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = src;
  });
}

function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  if (comma === -1) return dataUrl.length;
  const b64 = dataUrl.slice(comma + 1);
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

async function compressDataUrl(
  dataUrl: string,
  quality = COMPRESS_QUALITY,
): Promise<{ dataUrl: string; width: number; height: number; bytes: number }> {
  const img = await loadImage(dataUrl);
  let { width, height } = img;
  if (Math.max(width, height) > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0, width, height);
  const out = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl: out, width, height, bytes: dataUrlBytes(out) };
}

export async function processImageFile(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<ProcessedImage> {
  const err = validateImageFile(file);
  if (err) throw new Error(err);

  const originalDataUrl = await readFileAsDataUrl(file, (pct) => {
    // Reserve 0-70% for reading, 70-100% for compress/decode.
    onProgress?.(Math.round(pct * 0.7));
  });

  const img = await loadImage(originalDataUrl);
  const originalBytes = file.size;
  onProgress?.(85);

  if (file.size <= COMPRESS_THRESHOLD) {
    onProgress?.(100);
    return {
      dataUrl: originalDataUrl,
      width: img.naturalWidth,
      height: img.naturalHeight,
      bytes: originalBytes,
      originalBytes,
      compressed: false,
      mime: file.type || "image/jpeg",
      name: file.name || "chart",
    };
  }

  const compressed = await compressDataUrl(originalDataUrl);
  onProgress?.(100);
  return {
    dataUrl: compressed.dataUrl,
    width: compressed.width,
    height: compressed.height,
    bytes: compressed.bytes,
    originalBytes,
    compressed: true,
    mime: "image/jpeg",
    name: file.name || "chart",
  };
}