/** @module core/id
 * URL, hostname, and backing-project id primitives shared by brand concerns.
 * This core file imports no sibling concern and centralizes stable identifier formats.
 */

/** Normalize a user-typed URL, returning null when it is not usable HTTP(S). */
export function normalizeUrl(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.href;
}

/** Best-effort hostname label used for project names, prompts, and transcripts. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

/** Stable backing project id for a brand record. */
export function brandProjectId(brandId: string): string {
  return `brand-${brandId}`;
}
