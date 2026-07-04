/** @module catalog/index
 * Stored brand catalog operations: summaries, detail reads, deletion, and logo path resolution.
 * Routes depend on this read/write facade while storage primitives remain in core/.
 */

import fs from 'node:fs';
import path from 'node:path';

import type { BrandDetailResponse, BrandSummary } from '@open-design/contracts';

import { deleteUserDesignSystem } from '../../design-systems/index.js';
import {
  deleteBrandDir,
  listBrandIds,
  readBrand,
  readBrandGuide,
  readMeta,
  resolveBrandFile,
} from '../core/index.js';

export function listBrandSummaries(brandsRoot: string): BrandSummary[] {
  const out: BrandSummary[] = [];
  for (const id of listBrandIds(brandsRoot)) {
    const meta = readMeta(brandsRoot, id);
    if (!meta) continue;
    out.push({ meta, brand: readBrand(brandsRoot, id) });
  }
  return out;
}

/** Full detail for one brand, or null when it is missing. */
export function readBrandDetail(brandsRoot: string, id: string): BrandDetailResponse | null {
  const meta = readMeta(brandsRoot, id);
  if (!meta) return null;
  return {
    meta,
    brand: readBrand(brandsRoot, id),
    guide: readBrandGuide(brandsRoot, id),
  };
}

/**
 * Remove a brand and its registered user design system. Returns false when the
 * brand dir did not exist.
 */
export async function removeBrand(
  brandsRoot: string,
  userDesignSystemsRoot: string,
  id: string,
): Promise<boolean> {
  const meta = readMeta(brandsRoot, id);
  if (meta?.designSystemId) {
    try {
      await deleteUserDesignSystem(userDesignSystemsRoot, meta.designSystemId);
    } catch {
      // Best-effort — still remove the brand dir below.
    }
  }
  return deleteBrandDir(brandsRoot, id);
}

const LOGO_EXT_PRIORITY = ['.svg', '.png', '.webp', '.jpg', '.jpeg', '.gif', '.ico'];

/**
 * Absolute path to the brand's primary logo file, or null when none exists.
 * Prefers brand.logo.primary, then the first logo in `logos/` by extension
 * priority (vector/raster before icon).
 */
export function resolveBrandLogoPath(brandsRoot: string, id: string): string | null {
  const brand = readBrand(brandsRoot, id);
  const primary = brand?.logo?.primary;
  if (primary) {
    const rel = primary.replace(/^\.?\/+/, '').split('/').filter(Boolean);
    const abs = resolveBrandFile(brandsRoot, id, rel);
    if (abs && isFile(abs)) return abs;
  }

  const logosDir = resolveBrandFile(brandsRoot, id, ['logos']);
  if (!logosDir) return null;
  let names: string[];
  try {
    names = fs.readdirSync(logosDir);
  } catch {
    return null;
  }
  const ranked = names
    .filter((n) => isFile(path.join(logosDir, n)))
    .sort((a, b) => extRank(a) - extRank(b) || a.localeCompare(b));
  const pick = ranked[0];
  return pick ? path.join(logosDir, pick) : null;
}

function extRank(name: string): number {
  const i = LOGO_EXT_PRIORITY.indexOf(path.extname(name).toLowerCase());
  return i === -1 ? LOGO_EXT_PRIORITY.length : i;
}

function isFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}
