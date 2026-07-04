/** @module upload/multer-helpers
 *
 * Pure multipart-upload helpers shared by the daemon's upload routes:
 * collision-free upload filename selection, and multer error → API error
 * translation. These have no dependency on server.ts state (unlike the
 * `projectUpload` multer singleton, which closes over startServer's
 * project-metadata lookup and stays in the bootstrap layer).
 *
 * Extracted verbatim from server.ts (strangler-fig slice); fully typechecked
 * (server.ts is `@ts-nocheck`). Behaviour is byte-for-byte preserved; the two
 * status/message lookup maps gained `Record<string, …>` annotations so the
 * string-keyed lookups compile under strict mode.
 */
import path from 'node:path';
import fs from 'node:fs';
import type { Response } from 'express';
import multer from 'multer';
import { sendApiError } from '../http/api-errors.js';

/**
 * Picks a filesystem-safe upload filename that does not collide with an
 * existing file in `uploadDir` or with any name already `reserved` in the same
 * batch, suffixing `-1`, `-2`, … as needed and falling back to a timestamp.
 */
export function uniqueUploadFileName(uploadDir: string, safeName: string, reserved: Set<string>): string {
  const parsed = path.parse(safeName);
  const base = parsed.name || parsed.base || 'file';
  const ext = parsed.ext || '';
  for (let index = 0; index < 10_000; index += 1) {
    const candidate = index === 0 ? safeName : `${base}-${index}${ext}`;
    if (reserved.has(candidate)) continue;
    if (uploadDir && fs.existsSync(path.join(uploadDir, candidate))) continue;
    reserved.add(candidate);
    return candidate;
  }
  const fallback = `${base}-${Date.now().toString(36)}${ext}`;
  reserved.add(fallback);
  return fallback;
}

/** Translates a multer upload error into a typed API error response. */
export function sendMulterError(res: Response, err: unknown) {
  if (err instanceof multer.MulterError) {
    const code = err.code || 'UPLOAD_ERROR';
    const statusByCode: Record<string, number> = {
      LIMIT_FILE_SIZE: 413,
      LIMIT_FILE_COUNT: 400,
      LIMIT_UNEXPECTED_FILE: 400,
      LIMIT_PART_COUNT: 400,
      LIMIT_FIELD_KEY: 400,
      LIMIT_FIELD_VALUE: 400,
      LIMIT_FIELD_COUNT: 400,
      MISSING_FIELD_NAME: 400,
    };
    const errorByCode: Record<string, string> = {
      LIMIT_FILE_SIZE: 'file too large',
      LIMIT_FILE_COUNT: 'too many files',
      LIMIT_UNEXPECTED_FILE: 'unexpected file field',
      LIMIT_PART_COUNT: 'too many form parts',
      LIMIT_FIELD_KEY: 'field name too long',
      LIMIT_FIELD_VALUE: 'field value too long',
      LIMIT_FIELD_COUNT: 'too many form fields',
      MISSING_FIELD_NAME: 'missing field name',
    };
    const status = statusByCode[code] ?? 400;
    const message = errorByCode[code] ?? 'upload failed';
    return sendApiError(
      res,
      status,
      code === 'LIMIT_FILE_SIZE' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
      message,
      { details: { legacyCode: code } },
    );
  }

  if (err) {
    return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
  }

  return sendApiError(res, 500, 'INTERNAL_ERROR', 'upload failed');
}
