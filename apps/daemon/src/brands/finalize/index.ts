/** @module finalize/index
 * Brand finalization: validate agent or programmatic output, build generated systems, register user design systems, and sync project files.
 * This layer sits below extraction and above system, assets, kit, memory, and transcript concerns.
 */

import fs from 'node:fs';
import path from 'node:path';

import type {
  Brand,
  BrandFinalizeResponse,
  BrandMeta,
  ProjectMetadata,
} from '@open-design/contracts';

import {
  createUserDesignSystem,
  linkUserDesignSystemProject,
  updateUserDesignSystem,
  type UserDesignSystemInput,
} from '../../design-systems/index.js';
import { getProject, updateProject, type insertProject } from '../../db.js';
import { resolveProjectDir, writeProjectFile } from '../../project/index.js';
import {
  brandGuideMd,
  brandProjectId,
  brandToDesignMd,
  errorMessage,
  extractJsonBlock,
  isClosedDatabaseError,
  isDirectory,
  isFile,
  patchMeta,
  readBrandGuide,
  readMeta,
  readProjectTextOrNull,
  resolveBrandFile,
  validateBrand,
  writeBrand,
  writeBrandGuide,
  throwIfProgrammaticExtractionNotCurrent,
  isProgrammaticExtractionAbortError,
} from '../core/index.js';
import { ensureImageryFallback, ensureLogoFallback, selfHostGoogleFonts, type ImageryFallbackFn, type LogoFallbackFn } from '../assets/index.js';
import { writeBrandKitPreview } from '../kit/index.js';
import { brandSystemDir, rebuildSystem } from '../system/index.js';
import { reflowBrandToMemory } from '../memory/index.js';
import { reconcileProgrammaticExtractionTranscript } from '../transcript/index.js';

export interface FinalizeBrandOptions {
  id: string;
  brandsRoot: string;
  userDesignSystemsRoot: string;
  projectsRoot: string;
  /** Skills root so the final `brand.html` re-render can read the template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  /** Runtime data dir (`<dataDir>/memory` lives under it). When provided, the
   *  finalized brand is sedimented into the memory store so future chats can
   *  ground vague requests in the brand's palette, type, voice and rules.
   *  Omitted in unit tests that only exercise design-system registration. */
  dataDir?: string;
  /** Overrides the brand's recorded backing project. */
  projectId?: string;
  randomId?: () => string;
  /** Override the deterministic logo harvester (tests inject a no-op / stub to
   *  avoid real network calls). Defaults to the live icon-fetching fallback. */
  logoFallback?: LogoFallbackFn;
  /** Override the deterministic imagery harvester (tests inject a no-op / stub
   *  to avoid real network calls). Defaults to the live cover/hero-image
   *  fallback that runs when the agent captured too few `imagery.samples`. */
  imageryFallback?: ImageryFallbackFn;
  /** Optional override; defaults to the locale stored in brand meta. */
  locale?: string;
}

/**
 * Finalize an agent-extracted brand: read `brand.json` (+ optional BRAND.md,
 * logos, fonts) the agent wrote into the backing project, validate it, derive
 * the deterministic brand-system artifacts, and register the `user:<id>`
 * design system. Marks the brand `ready`. Throws with a precise message when
 * the agent output is missing or invalid.
 */
export async function finalizeBrand(
  opts: FinalizeBrandOptions,
): Promise<BrandFinalizeResponse> {
  const { id, brandsRoot, projectsRoot } = opts;
  const meta = readMeta(brandsRoot, id);
  if (!meta) throw new Error(`brand not found: ${id}`);
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);

  const brandJsonRaw = await readProjectTextOrNull(projectsRoot, projectId, 'brand.json');
  if (brandJsonRaw === null) {
    throw new Error(
      'brand.json not found in the extraction project — the agent has not written the design system yet.',
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(brandJsonRaw);
  } catch {
    const block = extractJsonBlock(brandJsonRaw);
    if (block === null) throw new Error('brand.json is not valid JSON.');
    parsed = block;
  }
  let brand: Brand;
  try {
    brand = validateBrand(parsed, meta.sourceUrl);
  } catch (err) {
    throw new Error(`brand.json failed validation: ${errorMessage(err)}`);
  }

  // Pull the agent's downloaded assets into the brand workspace so the
  // deterministic builder and the design system see them.
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'logos');
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'fonts');
  copyProjectDirToBrand(projectsRoot, projectId, brandsRoot, id, 'imagery');

  const guideMd =
    (await readProjectTextOrNull(projectsRoot, projectId, 'BRAND.md')) ?? brandGuideMd(brand);

  return finalizeBrandCore({ ...opts, id, projectId, meta, brand, guideMd });
}

export interface FinalizeBrandCoreOptions extends FinalizeBrandOptions {
  /** Backing project to sync the finalized design system into. */
  projectId: string;
  /** Lifecycle record (already loaded by the caller). */
  meta: BrandMeta;
  /** The validated design system to register — already in memory, so this is
   *  shared by both the programmatic-first path (brandFromMaterial) and the
   *  agent enrichment path (brand.json from the project). */
  brand: Brand;
  /** Prose guide markdown to persist alongside the design system. */
  guideMd: string;
  /** Optional cancellation hook for the background programmatic pass only. */
  abortSignal?: AbortSignal;
  /** Programmatic attempt that is allowed to commit terminal writes. */
  extractionAttemptId?: string;
}

/**
 * Shared finalize body: persist the design system, run the deterministic logo /
 * imagery / font safety nets over the brand workspace, build the token system +
 * artifacts, register the reusable `user:<id>` design system, sync everything
 * into the backing project, and mark the brand `ready`. Assumes the caller has
 * already populated the brand workspace assets (logos / fonts / imagery).
 */
export async function finalizeBrandCore(opts: FinalizeBrandCoreOptions): Promise<BrandFinalizeResponse> {
  const {
    id,
    brandsRoot,
    userDesignSystemsRoot,
    projectsRoot,
    db,
    meta,
    projectId,
    brand,
    guideMd,
    logoFallback = ensureLogoFallback,
    imageryFallback = ensureImageryFallback,
  } = opts;

  throwIfProgrammaticExtractionNotCurrent(opts);
  writeBrand(brandsRoot, id, brand);
  writeBrandGuide(brandsRoot, id, guideMd);

  // Deterministic logo safety net: if the agent saved no logo and left
  // `logo.primary` empty, fetch the site's icon assets server-side so the kit
  // almost never shows "No logo found". Best-effort — offline just leaves it
  // empty. Re-persist brand.json so the populated logo flows into the design
  // system, the synced project files, and memory below.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) {
      const result = await logoFallback(meta.sourceUrl, path.join(brandDir, 'logos'), brand.logo);
      throwIfProgrammaticExtractionNotCurrent(opts);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch (err) {
    if (isProgrammaticExtractionAbortError(err)) throw err;
    // Offline / unreachable origin — keep the (empty) logo and continue.
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

  // Deterministic imagery safety net: if the agent captured too few
  // representative images, harvest the site's real cover/hero images
  // server-side so the kit's Images gallery actually populates. It first
  // adopts any files already saved into imagery/ (offline), then harvests the
  // live site only when still short. Best-effort — offline just leaves the
  // gallery as the agent left it. Re-persist brand.json so the new samples
  // flow into the synced project files and the rendered kit page below.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) {
      const result = await imageryFallback(meta.sourceUrl, path.join(brandDir, 'imagery'), brand.imagery);
      throwIfProgrammaticExtractionNotCurrent(opts);
      if (result.changed) writeBrand(brandsRoot, id, brand);
    }
  } catch (err) {
    if (isProgrammaticExtractionAbortError(err)) throw err;
    // Offline / unreachable origin — keep whatever imagery the agent saved.
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

  // Self-host any Google Fonts the agent declared (typography.*.googleFontsUrl)
  // into the brand's fonts/ + manifest.json so the component kit, the exported
  // brandpack, and the brand.html specimens render in the real typefaces rather
  // than a fallback. Best-effort: network failures leave the fallback stacks.
  try {
    const brandDir = resolveBrandFile(brandsRoot, id, []);
    if (brandDir) await selfHostGoogleFonts(brand, brandDir);
  } catch {
    // Offline / unreachable font CSS — keep going with whatever the agent saved.
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

  const systemBuild = await rebuildSystem(brandsRoot, id);
  throwIfProgrammaticExtractionNotCurrent(opts);

  const body = brandToDesignMd(brand);
  const summary = await registerBrandDesignSystem(userDesignSystemsRoot, meta.designSystemId, {
    title: brand.name,
    category: 'Brands',
    surface: 'web',
    status: 'published',
    artifactMode: 'agent-managed',
    body,
    provenance: {
      ...(brand.description ? { companyBlurb: brand.description } : {}),
      sourceNotes: `Extracted from ${meta.sourceUrl}`,
    },
  });
  throwIfProgrammaticExtractionNotCurrent(opts);
  const designSystemId = summary.id;
  syncBrandSystemToUserDesignSystem(userDesignSystemsRoot, designSystemId, brandsRoot, id, body);
  throwIfProgrammaticExtractionNotCurrent(opts);

  const finalizeMetadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    entryFile: 'system/index.html',
    sourceFileName: brand.name,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: meta.sourceUrl,
    brandDesignSystemId: designSystemId,
  };
  await syncBrandFilesToProject({
    brandsRoot,
    projectsRoot,
    brandId: id,
    projectId,
    brand,
    metadata: finalizeMetadata,
  });
  throwIfProgrammaticExtractionNotCurrent(opts);

  // Re-render the kit page now that the brand is complete and the six system
  // artifacts exist in the project, so the Brand Assets tiles light up with
  // live previews and the status flips to "Brand ready".
  await writeBrandKitPreview({
    skillsRoot: opts.skillsRoot,
    projectsRoot,
    projectId,
    brand: brand as unknown as Record<string, unknown>,
    status: 'ready',
    metadata: finalizeMetadata,
    locale: opts.locale ?? meta.locale,
  });
  throwIfProgrammaticExtractionNotCurrent(opts);

  await linkUserDesignSystemProject(userDesignSystemsRoot, designSystemId, projectId);
  throwIfProgrammaticExtractionNotCurrent(opts);

  const existing = getProject(db, projectId);
  if (existing) {
    updateProject(db, projectId, {
      name: `${brand.name || meta.sourceUrl} Design System`,
      skillId: existing.skillId ?? null,
      designSystemId,
      pendingPrompt: existing.pendingPrompt ?? null,
      metadata: { ...(existing.metadata ?? {}), ...finalizeMetadata },
      customInstructions: existing.customInstructions ?? null,
      updatedAt: Date.now(),
    });
  }
  throwIfProgrammaticExtractionNotCurrent(opts);

  patchMeta(brandsRoot, id, {
    status: 'ready',
    error: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    designSystemId,
    systemFiles: systemBuild.files,
    projectId,
    // Any anti-bot wall the programmatic pass flagged is moot now the brand is
    // finalized — clear it so the web stops prompting the browser fallback.
    blocked: false,
    blockedReason: undefined,
  });

  // Authoritatively retire the synthetic "Working" transcript row the moment
  // the brand is actually finalized `ready` + registered. This is the fix for
  // "succeeded but never terminated": it runs from the real completion point, so
  // it lands even when the brand finalizes long after the background stall timer
  // fired (heavy site) and regardless of which path (programmatic or agent
  // `od brand finalize`) drove the finalize. Best-effort — a reconcile failure
  // must never fail an otherwise-successful finalize.
  try {
    await reconcileProgrammaticExtractionTranscript({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      outcome: 'succeeded',
      ...(opts.locale ?? meta.locale ? { locale: opts.locale ?? meta.locale } : {}),
    });
  } catch (err) {
    if (!isClosedDatabaseError(err)) {
      console.warn(`[brand] failed to reconcile success transcript for ${id}`, err);
    }
  }

  // Sediment the brand into memory so future chats can ground a vague request
  // ("做个落地页") in this brand's palette, type, voice and enforceable rules.
  // Best-effort and gated on the master memory switch inside the reflow — a
  // failure here must never fail an otherwise-successful finalize.
  if (opts.dataDir) {
    try {
      await reflowBrandToMemory(opts.dataDir, brand);
    } catch (err) {
      console.warn(`[brand] memory reflow failed for ${id}`, err);
    }
  }

  return { id, brand, designSystemId, projectId, files: systemBuild.files };
}

async function registerBrandDesignSystem(
  userDesignSystemsRoot: string,
  existingDesignSystemId: string | undefined,
  input: UserDesignSystemInput,
): Promise<Awaited<ReturnType<typeof createUserDesignSystem>>> {
  if (existingDesignSystemId) {
    const updated = await updateUserDesignSystem(userDesignSystemsRoot, existingDesignSystemId, input);
    if (updated) return updated;
  }
  return createUserDesignSystem(userDesignSystemsRoot, input);
}

/** Copy a top-level project subdirectory (logos / fonts) into the brand dir. */
function copyProjectDirToBrand(
  projectsRoot: string,
  projectId: string,
  brandsRoot: string,
  brandId: string,
  dirName: string,
): void {
  let projectDir: string;
  try {
    projectDir = resolveProjectDir(projectsRoot, projectId);
  } catch {
    return;
  }
  const source = path.join(projectDir, dirName);
  if (!isDirectory(source)) return;
  const target = resolveBrandFile(brandsRoot, brandId, [dirName]);
  if (!target) return;
  copyDirectorySync(source, target);
}

async function syncBrandFilesToProject(input: {
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  projectId: string;
  brand: Brand;
  metadata: ProjectMetadata;
}): Promise<void> {
  const brandRoot = resolveBrandFile(input.brandsRoot, input.brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${input.brandId}`);
  const write = async (name: string, body: string | Buffer) => {
    await writeProjectFile(input.projectsRoot, input.projectId, name, body, { overwrite: true }, input.metadata);
  };
  await write('brand.json', JSON.stringify(input.brand, null, 2));
  await write('DESIGN.md', brandToDesignMd(input.brand));
  await writeOptionalFileToProject(input.projectsRoot, input.projectId, input.metadata, brandRoot, 'guide.md');
  await copyDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, brandSystemDir(input.brandsRoot, input.brandId), 'system');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'logos'), 'logos');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'fonts'), 'fonts');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'imagery'), 'imagery');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'prefetch'), 'prefetch');
  await copyOptionalDirectoryToProject(input.projectsRoot, input.projectId, input.metadata, path.join(brandRoot, 'context'), 'context');
}

async function writeOptionalFileToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  root: string,
  rel: string,
): Promise<void> {
  const abs = path.join(root, rel);
  if (!isFile(abs)) return;
  await writeProjectFile(projectsRoot, projectId, rel, fs.readFileSync(abs), { overwrite: true }, metadata);
}

async function copyOptionalDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  if (!isDirectory(sourceDir)) return;
  await copyDirectoryToProject(projectsRoot, projectId, metadata, sourceDir, targetPrefix);
}

async function copyDirectoryToProject(
  projectsRoot: string,
  projectId: string,
  metadata: ProjectMetadata,
  sourceDir: string,
  targetPrefix: string,
): Promise<void> {
  for (const file of collectFiles(sourceDir)) {
    const projectPath = toPosixPath(path.join(targetPrefix, file.rel));
    await writeProjectFile(projectsRoot, projectId, projectPath, fs.readFileSync(file.abs), { overwrite: true }, metadata);
  }
}

function syncBrandSystemToUserDesignSystem(
  userDesignSystemsRoot: string,
  designSystemId: string,
  brandsRoot: string,
  brandId: string,
  designMd: string,
): void {
  const dir = userDesignSystemDir(userDesignSystemsRoot, designSystemId);
  if (!dir) throw new Error(`invalid design system id: ${designSystemId}`);
  const brandRoot = resolveBrandFile(brandsRoot, brandId, []);
  if (!brandRoot) throw new Error(`invalid brand id: ${brandId}`);

  fs.writeFileSync(path.join(dir, 'DESIGN.md'), designMd, 'utf8');
  copyDirectorySync(brandSystemDir(brandsRoot, brandId), path.join(dir, 'system'));
  copyOptionalDirectorySync(path.join(brandRoot, 'logos'), path.join(dir, 'logos'));
  copyOptionalDirectorySync(path.join(brandRoot, 'fonts'), path.join(dir, 'fonts'));
  copyOptionalDirectorySync(path.join(brandRoot, 'imagery'), path.join(dir, 'imagery'));
  copyOptionalDirectorySync(path.join(brandRoot, 'prefetch'), path.join(dir, 'prefetch'));
  const brandJson = resolveBrandFile(brandsRoot, brandId, ['brand.json']);
  if (brandJson && isFile(brandJson)) {
    fs.copyFileSync(brandJson, path.join(dir, 'brand.json'));
  }
}

function userDesignSystemDir(root: string, id: string): string | null {
  if (!id.startsWith('user:')) return null;
  const dirId = id.slice('user:'.length);
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(dirId)) return null;
  const base = path.resolve(root);
  const target = path.resolve(base, dirId);
  if (target !== base && target.startsWith(`${base}${path.sep}`)) return target;
  return null;
}

function copyOptionalDirectorySync(sourceDir: string, targetDir: string): void {
  if (!isDirectory(sourceDir)) return;
  copyDirectorySync(sourceDir, targetDir);
}

function copyDirectorySync(sourceDir: string, targetDir: string): void {
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  for (const file of collectFiles(sourceDir)) {
    const target = path.join(targetDir, file.rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.abs, target);
  }
}

function collectFiles(root: string): Array<{ abs: string; rel: string }> {
  const out: Array<{ abs: string; rel: string }> = [];
  const walk = (dir: string, prefix: string) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const rel = prefix ? path.join(prefix, entry.name) : entry.name;
      if (entry.isDirectory()) {
        walk(abs, rel);
      } else if (entry.isFile()) {
        out.push({ abs, rel: toPosixPath(rel) });
      }
    }
  };
  walk(root, '');
  return out.sort((a, b) => a.rel.localeCompare(b.rel));
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}
