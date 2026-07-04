/** @module identifiers
 *
 * Generic daemon-wide identifier helpers: opaque id generation and slug
 * sanitization. Consumed across route modules via the ctx deps bundles
 * (`ctx.ids.randomId`, and the slug helper threaded alongside), so they are
 * daemon utilities rather than server-lifecycle concerns.
 *
 * Extracted verbatim from server.ts (strangler-fig slice); fully typechecked
 * (server.ts is `@ts-nocheck`). Behaviour is byte-for-byte preserved.
 */
import { randomUUID } from 'node:crypto';

/** Opaque, collision-resistant identifier (UUID v4). */
export function randomId(): string {
  return randomUUID();
}

/**
 * Normalizes arbitrary text into a URL/file-safe slug: lowercased, non-word
 * characters stripped, whitespace/underscores collapsed to single hyphens,
 * leading/trailing hyphens trimmed, capped at 64 characters.
 */
export function sanitizeSlug(text: string): string {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}
