import { rasterDocumentContentType } from "../../../../lib/documentTypes";
import type { LlmToolImage } from "../../../../lib/llm/types";
import { reportError } from "../../../../lib/observability/sentry";
import { hasImageSignature } from "../../../../lib/profileImage";
import { openFileStream } from "../../../../lib/storage";

const MAX_PHOTOS_PER_TURN = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_TURN_PHOTO_BYTES = 16 * 1024 * 1024;

export type PhotoReadBudget = { count: number; bytes: number };

export async function readPhotoEvidence(args: {
  label: string;
  fileType: string;
  storagePath: string;
  budget: PhotoReadBudget;
  signal?: AbortSignal;
}): Promise<{ image: LlmToolImage } | { error: string }> {
  const { label, fileType, storagePath, budget, signal } = args;
  const mediaType = rasterDocumentContentType(fileType);
  if (!mediaType || !storagePath) return { error: "This photo has no readable original file." };
  if (budget.count >= MAX_PHOTOS_PER_TURN || budget.bytes >= MAX_TURN_PHOTO_BYTES) {
    return { error: "The photo limit for this answer was reached. Ask about fewer photos at a time." };
  }
  const limit = Math.min(MAX_PHOTO_BYTES, MAX_TURN_PHOTO_BYTES - budget.bytes);
  try {
    const stream = await openFileStream(storagePath, { signal });
    try {
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > limit) {
          return { error: limit === MAX_PHOTO_BYTES
            ? "This photo is larger than the 8 MB visual-reading limit. Attach a smaller copy for analysis."
            : "This photo exceeds the remaining visual-reading limit for this answer. Ask about fewer photos at a time." };
        }
        chunks.push(buffer);
      }
      const image = Buffer.concat(chunks, bytes);
      if (!hasImageSignature(mediaType, image)) {
        return { error: "This photo could not be read as its declared image format." };
      }
      budget.bytes += bytes;
      budget.count += 1;
      return { image: { label, bytes: image, mediaType } };
    } finally {
      stream.destroy();
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    reportError(error, { level: "warning", tags: { component: "chat-stream", operation: "chat.photo_read" } });
    return { error: "The photo could not be read from storage. Please try again." };
  }
}
