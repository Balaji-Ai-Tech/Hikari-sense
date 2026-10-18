// Upload abstraction. DEMO: simulated. Production: request a presigned S3/MinIO URL from the backend, then PUT the file.
// Storage credentials never reach the browser.
import type { UploadedMedia } from "@/types";

export const UPLOAD_LIMITS = {
  maxFiles: 6,
  imageMb: 25,
  videoMb: 25,
  types: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
  ],
};

export function validateFile(file: File, existing: number): string | null {
  if (existing >= UPLOAD_LIMITS.maxFiles) return "tooMany";
  if (!UPLOAD_LIMITS.types.includes(file.type)) return "badType";
  const mb = file.size / 1048576;
  if (file.type.startsWith("video/") ? mb > UPLOAD_LIMITS.videoMb : mb > UPLOAD_LIMITS.imageMb)
    return "tooBig";
  return null;
}

export interface Uploader {
  upload(file: File, onProgress: (pct: number) => void): Promise<UploadedMedia>;
}

/** Simulated uploader — files never leave the browser. ~5% simulated failures to exercise retry UI. */
export const demoUploader: Uploader = {
  upload(file, onProgress) {
    return new Promise((resolve, reject) => {
      let pct = 0;
      const fail = /fail/i.test(file.name) || Math.random() < 0.05;
      const t = setInterval(() => {
        pct = Math.min(100, pct + 12 + Math.random() * 18);
        onProgress(Math.round(pct));
        if (fail && pct > 55) {
          clearInterval(t);
          reject(new Error("uploadFailed"));
        } else if (pct >= 100) {
          clearInterval(t);
          resolve({
            name: file.name,
            size: file.size,
            kind: file.type.startsWith("video/") ? "video" : "image",
            key: `demo/${crypto.randomUUID()}`,
          });
        }
      }, 180);
    });
  },
};
