/** @module preview/index
 * Live brand kit preview rendering for in-progress extraction projects.
 * The preview layer reads partial project brand JSON, adopts visible logo files, and delegates HTML rendering to kit/.
 */

import path from 'node:path';

import { resolveProjectDir } from '../../project/index.js';
import { adoptExistingLogos, type LogoSlot } from '../assets/index.js';
import {
  brandProjectId,
  extractJsonBlock,
  readMeta,
  readProjectTextOrNull,
} from '../core/index.js';
import { BRAND_KIT_FILE, writeBrandKitPreview, type BrandKitStatus } from '../kit/index.js';

export interface RenderBrandPreviewOptions {
  id: string;
  brandsRoot: string;
  skillsRoot: string;
  projectsRoot: string;
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
  /** Explicit preview lifecycle for caller-known states such as user stop. */
  previewStatus?: BrandKitStatus;
  /** Optional override; defaults to the locale stored in brand meta. */
  locale?: string;
}

export interface RenderBrandPreviewResult {
  id: string;
  projectId: string;
  file: string;
  /** True when a brand.json was found and rendered; false means an empty
   *  scaffold was (re)written so the page still shows progress. */
  rendered: boolean;
}

/**
 * Re-render `brand.html` from whatever the agent has written into the project's
 * `brand.json` so far. Lenient by design — partial / in-progress brand data
 * renders with skeletons for the missing modules, which is exactly the live
 * "filling in" experience. Called after each measurement pass via
 * `POST /api/brands/:id/preview` (`od brand preview`).
 */
export async function renderBrandPreviewIntoProject(
  opts: RenderBrandPreviewOptions,
): Promise<RenderBrandPreviewResult> {
  const { id, brandsRoot, skillsRoot, projectsRoot } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);
  const status: BrandKitStatus = opts.previewStatus ?? (meta.status === 'ready'
    ? 'ready'
    : meta.status === 'failed'
      ? 'failed'
      : meta.status === 'extracting' || meta.status === 'needs_input'
      ? 'extracting'
      : 'draft');

  const raw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  let brand: Record<string, unknown> = { sourceUrl: meta.sourceUrl, colors: [], typography: {} };
  let rendered = false;
  if (raw !== null) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = extractJsonBlock(raw);
    }
    if (parsed && typeof parsed === 'object') {
      brand = parsed as Record<string, unknown>;
      if (typeof brand.sourceUrl !== 'string' || !brand.sourceUrl) brand.sourceUrl = meta.sourceUrl;
      rendered = true;
    }
  }

  // Keep the live page logo-complete: when brand.json carries no `logo.primary`
  // yet (the agent overwrote the seed or hasn't saved a mark), adopt whatever
  // logo files already sit in the project's `logos/` dir so the page shows a
  // real mark instead of "No logo found". Non-destructive — enriches only the
  // render payload; finalize is what persists the adopted primary to brand.json.
  try {
    const projectDir = resolveProjectDir(projectsRoot, projectId, {
      kind: 'brand',
      brandId: id,
      brandSourceUrl: meta.sourceUrl,
    });
    const logoSlot = brandLogoSlot(brand.logo);
    if (!logoSlot.primary) {
      const adopted = adoptExistingLogos(path.join(projectDir, 'logos'), logoSlot);
      if (adopted.changed) brand.logo = logoSlot;
    }
  } catch {
    // Best-effort enrichment — never block the preview render on logo adoption.
  }

  await writeBrandKitPreview({
    skillsRoot,
    projectsRoot,
    projectId,
    brand,
    status,
    metadata: { kind: 'brand', brandId: id, brandSourceUrl: meta.sourceUrl },
    locale: opts.locale ?? meta.locale,
  });
  return { id, projectId, file: BRAND_KIT_FILE, rendered };
}

function brandLogoSlot(raw: unknown): LogoSlot {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    primary: typeof o.primary === 'string' && o.primary ? o.primary : null,
    alternates: Array.isArray(o.alternates) ? o.alternates.filter((a): a is string => typeof a === 'string') : [],
    notes: typeof o.notes === 'string' ? o.notes : '',
  };
}
