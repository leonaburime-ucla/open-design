/** @module extraction/index
 * Brand extraction orchestration: reserve backing projects, seed programmatic transcripts, run deterministic harvests, and restart blocked extractions.
 * This layer depends on core primitives plus the finalize, preview, transcript, assets, generation, and kit barrels; callers use the brands root barrel.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import type {
  BrandFinalizeResponse,
  BrandMeta,
  ProjectMetadata,
} from '@open-design/contracts';

import {
  createUserDesignSystem,
  deleteUserDesignSystem,
  linkUserDesignSystemProject,
} from '../../design-systems/index.js';
import {
  deleteProject as deleteDbProject,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  setTabs,
  updateProject,
} from '../../db.js';
import { resolveProjectDir, writeProjectFile } from '../../project/index.js';
import {
  BRAND_BROWSER_TAB_ID,
  brandFromDesignMd,
  brandGuideMd,
  brandProjectId,
  brandToDesignMd,
  createBrandDir,
  deleteBrandDir,
  extractJsonBlock,
  hostnameOf,
  isClosedDatabaseError,
  newBrandId,
  newBrandExtractionAttemptId,
  normalizeUrl,
  patchMeta,
  programmaticExtractionAttemptIsCurrent,
  readMeta,
  resolveBrandFile,
  sourceUrlForDesignMd,
  throwIfProgrammaticExtractionNotCurrent,
  isProgrammaticExtractionAbortError,
  ProgrammaticExtractionAbortError,
} from '../core/index.js';
import { readBrandDetail } from '../catalog/index.js';
import { brandFromMaterial } from '../generation/index.js';
import {
  ensureBrandSeed,
  ensureImageryFallback,
  ensureLogoFallback,
  prefetchBrand,
  prefetchFromHtml,
  type ImageryFallbackFn,
  type ImagerySlot,
  type LogoFallbackFn,
  type PrefetchResult,
  type SeedFallbackFn,
  type SeedSlot,
} from '../assets/index.js';
import { BRAND_KIT_FILE, normalizeBrandKitLocale, writeBrandKitPreview } from '../kit/index.js';
import { finalizeBrandCore } from '../finalize/index.js';
import { renderBrandPreviewIntoProject } from '../preview/index.js';
import {
  reconcileProgrammaticExtractionTranscript,
  seedProgrammaticExtractionStartTranscript,
} from '../transcript/index.js';
import type { TranscriptAgent } from '../core/index.js';

export interface StartBrandExtractionOptions {
  /** Website/source URL. Optional when a pasted DESIGN.md is provided. */
  url?: string;
  /** Short human context; the fast path uses it as intro + voice. */
  description?: string;
  /** Pasted DESIGN.md content to parse locally before AI enrichment. */
  designMd?: string;
  brandsRoot: string;
  projectsRoot: string;
  /** Skills root so the seeded `brand.html` can be rendered from the bundled
   *  brand-extract template. */
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  randomId?: () => string;
  /** Override the deterministic logo harvester (tests inject a no-op / stub to
   *  avoid real network calls). Defaults to the live icon-fetching fallback. */
  logoFallback?: LogoFallbackFn;
  /** Override the deterministic palette/typography seed harvester (tests inject
   *  a no-op to avoid real network calls). Defaults to the live CSS harvester
   *  so the first paint already shows a real palette + fonts. */
  seedFallback?: SeedFallbackFn;
  /** Override the deterministic imagery harvester (tests inject a no-op to avoid
   *  real network calls). Defaults to the live cover/hero-image fallback so the
   *  first paint already shows representative images. */
  imageryFallback?: ImageryFallbackFn;
  /** `<dataDir>/design-systems` — registry root. Required to run the
   *  programmatic-first extraction (which registers a `user:<id>` design system
   *  in the background). When omitted, no programmatic finalize runs and the
   *  brand stays `extracting` for the agent to drive (the legacy behavior tests
   *  use). */
  userDesignSystemsRoot?: string;
  /** Runtime data dir so the programmatically-built design system is sedimented
   *  into memory. Optional. */
  dataDir?: string;
  /** Abort signal owned by the HTTP route Stop control for the programmatic
   *  first pass. Agent-driven finalize paths do not use it. */
  programmaticAbortSignal?: AbortSignal;
  /** Override the deterministic site harvester used by the programmatic-first
   *  extraction (tests inject a stub to stay offline). Defaults to the live
   *  network prefetch. */
  prefetch?: PrefetchFn;
  /** Deprecated no-op retained for older tests/callers. Brand starts now always
   *  return immediately after the project, transcript, and skeleton page are
   *  persisted; programmatic finalize settles in the background. */
  programmaticSyncBudgetMs?: number;
  /** Test/observability hook invoked with the background programmatic-extraction
   *  promise, so callers (tests) can await completion deterministically. */
  onBackgroundExtraction?: (settled: Promise<unknown>) => void;
  /** UI locale used to render static brand.html copy. */
  locale?: string;
  /** Agent identity to show on the programmatic transcript. No tokens are spent,
   *  but the synthetic turn should align with the user's selected code agent. */
  transcriptAgent?: TranscriptAgent;
}

export interface StartBrandExtractionResult {
  id: string;
  projectId: string;
  conversationId: string;
  sourceUrl: string;
  status: BrandMeta['status'];
  designSystemId?: string;
  brandName?: string;
}

export interface ContinueBrandExtractionOptions {
  id: string;
  brandsRoot: string;
  projectsRoot: string;
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  userDesignSystemsRoot: string;
  dataDir?: string;
  randomId?: () => string;
  logoFallback?: LogoFallbackFn;
  imageryFallback?: ImageryFallbackFn;
  prefetch?: PrefetchFn;
  programmaticAbortSignal?: AbortSignal;
  onBackgroundExtraction?: (settled: Promise<unknown>) => void;
  locale?: string;
  transcriptAgent?: TranscriptAgent;
}

const MAX_DESIGN_MD_INPUT_CHARS = 240_000;

function normalizeDesignMdInput(raw: string | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_DESIGN_MD_INPUT_CHARS);
}

function writeDesignMdInput(brandsRoot: string, id: string, designMd: string): void {
  const dir = resolveBrandFile(brandsRoot, id, ['context']);
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'input-DESIGN.md'), designMd, 'utf8');
}

function readDesignMdInput(brandsRoot: string, id: string): string {
  const file = resolveBrandFile(brandsRoot, id, ['context', 'input-DESIGN.md']);
  if (!file) return '';
  try {
    return normalizeDesignMdInput(fs.readFileSync(file, 'utf8'));
  } catch {
    return '';
  }
}

async function rollbackBrandExtractionStartup(input: {
  db: Parameters<typeof insertProject>[0];
  brandsRoot: string;
  projectsRoot: string;
  brandId: string;
  projectId: string;
  metadata: ProjectMetadata;
  userDesignSystemsRoot?: string | undefined;
  draftDesignSystemId?: string | null;
}): Promise<void> {
  try {
    deleteDbProject(input.db, input.projectId);
  } catch (err) {
    if (!isClosedDatabaseError(err)) {
      console.warn(`[brand] failed to roll back project row for ${input.brandId}`, err);
    }
  }
  try {
    const projectDir = resolveProjectDir(input.projectsRoot, input.projectId, input.metadata);
    fs.rmSync(projectDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[brand] failed to roll back project directory for ${input.brandId}`, err);
  }
  if (input.draftDesignSystemId && input.userDesignSystemsRoot) {
    try {
      await deleteUserDesignSystem(input.userDesignSystemsRoot, input.draftDesignSystemId);
    } catch (rollbackErr) {
      console.warn(`[brand] failed to roll back draft design system for ${input.brandId}`, rollbackErr);
    }
  }
  try {
    deleteBrandDir(input.brandsRoot, input.brandId);
  } catch (err) {
    console.warn(`[brand] failed to roll back brand directory for ${input.brandId}`, err);
  }
}

export async function startBrandExtraction(
  opts: StartBrandExtractionOptions,
): Promise<StartBrandExtractionResult> {
  const designMd = normalizeDesignMdInput(opts.designMd);
  const rawUrl = (opts.url ?? '').trim();
  const url = rawUrl ? normalizeUrl(rawUrl) : designMd ? sourceUrlForDesignMd(designMd, opts.description) : null;
  if (rawUrl && !url) throw new Error('Enter a valid http(s) website URL.');
  if (!url) throw new Error('Enter a valid http(s) website URL or paste a DESIGN.md.');
  const hasWebsiteSource = /^https?:\/\//i.test(url);
  const hasDesignMdSource = Boolean(designMd);

  const {
    brandsRoot,
    projectsRoot,
    skillsRoot,
    db,
    randomId = randomUUID,
    logoFallback = ensureLogoFallback,
    seedFallback = ensureBrandSeed,
    imageryFallback = ensureImageryFallback,
  } = opts;
  const id = newBrandId(url);
  const projectId = brandProjectId(id);
  const conversationId = randomId();
  const host = hostnameOf(url);
  const now = Date.now();
  const locale = normalizeBrandKitLocale(opts.locale);
  const extractionAttemptId = newBrandExtractionAttemptId();

  const meta: BrandMeta = {
    id,
    sourceUrl: url,
    createdAt: now,
    updatedAt: now,
    status: 'extracting',
    projectId,
    extractionConversationId: conversationId,
    locale,
    extractionAttemptId,
  };
  const metadata: ProjectMetadata = {
    kind: 'brand',
    importedFrom: 'brand-extraction',
    sourceFileName: host,
    nameSource: 'generated',
    skipDiscoveryBrief: true,
    brandId: id,
    brandSourceUrl: url,
  };
  const name = `${host} Design System`;
  const runProgrammatic = Boolean(opts.userDesignSystemsRoot);
  const fallbackPrompt = brandExtractionFallbackPrompt({
    url,
    brandId: id,
    host,
    hasWebsiteSource,
    hasDesignMdSource,
  });
  const pendingPrompt = runProgrammatic
    ? null
    : brandExtractionPrompt({ url, brandId: id, host, hasWebsiteSource, hasDesignMdSource });

  // Entity-first: register the `user:<id>` design system NOW, as a draft, so it
  // appears under "Your systems" the moment the project opens and stays editable
  // even if extraction fails or is stopped — instead of only materializing on a
  // successful finalize (the bug where a started extraction never showed up in
  // the list). finalizeBrandCore reuses this exact id (never duplicates),
  // enriching the draft in place. This is part of the start contract: if the
  // draft cannot be registered, the extraction should not create a project that
  // looks like a design system but has no backing editable system.
  let draftDesignSystemId: string | null = null;
  try {
    createBrandDir(brandsRoot, id, meta);
    if (designMd) writeDesignMdInput(brandsRoot, id, designMd);

    if (runProgrammatic && opts.userDesignSystemsRoot) {
      const draft = await createUserDesignSystem(opts.userDesignSystemsRoot, {
        title: host,
        category: 'Brands',
        surface: 'web',
        status: 'draft',
        artifactMode: 'agent-managed',
        provenance: {
          sourceUrls: [url],
          sourceNotes: `Extracting from ${url}`,
        },
      });
      draftDesignSystemId = draft.id;
      meta.designSystemId = draft.id;
      patchMeta(brandsRoot, id, { designSystemId: draft.id });
      metadata.brandDesignSystemId = draft.id;
    }

    insertProject(db, {
      id: projectId,
      name,
      skillId: null,
      designSystemId: draftDesignSystemId,
      pendingPrompt,
      metadata,
      customInstructions: null,
      createdAt: now,
      updatedAt: now,
    });
    if (draftDesignSystemId && opts.userDesignSystemsRoot) {
      try {
        await linkUserDesignSystemProject(opts.userDesignSystemsRoot, draftDesignSystemId, projectId);
      } catch (err) {
        console.warn(`[brand] failed to link draft design system to project for ${id}`, err);
      }
    }
    insertConversation(db, {
      id: conversationId,
      projectId,
      title: null,
      sessionMode: 'design',
      createdAt: now,
      updatedAt: now,
    });

    // Seed the design-system page immediately so the user sees a real, on-brand
    // scaffold the moment the project opens — not just a scrolling chat. It
    // starts as skeletons + "Extracting…" and is replaced by the programmatic
    // first paint (below) or filled in by the agent's `od brand preview` passes.
    //
    // When programmatic-first extraction is going to run (the common path —
    // `userDesignSystemsRoot` is wired by the route), skip the legacy seed
    // harvest entirely: the synchronous programmatic finalize re-fetches the
    // same material and produces a complete, ready page anyway, so a second
    // network harvest here would only add latency. Otherwise (legacy / tests),
    // run the bounded parallel seed harvest so the first paint already shows a
    // real logo / palette / fonts / cover imagery before the agent measures.
    const seedBrand: Record<string, unknown> = { name: host, sourceUrl: url, colors: [], typography: {} };
    if (!runProgrammatic) {
      try {
        const projectDir = resolveProjectDir(projectsRoot, projectId, metadata);
        const logo = { primary: null as string | null, alternates: [] as string[], notes: '' };
        const seedSlot: SeedSlot = {};
        const imagery: ImagerySlot = { samples: [] };
        const noChange = () => ({ changed: false });
        const [logoRes] = await Promise.all([
          logoFallback(url, path.join(projectDir, 'logos'), logo).catch(noChange),
          seedFallback(url, seedSlot).catch(noChange),
          imageryFallback(url, path.join(projectDir, 'imagery'), imagery).catch(noChange),
        ]);
        if (logoRes.changed) seedBrand.logo = logo;
        if (seedSlot.colors && seedSlot.colors.length) seedBrand.colors = seedSlot.colors;
        if (seedSlot.typography) seedBrand.typography = seedSlot.typography;
        if (imagery.samples && imagery.samples.length) seedBrand.imagery = { samples: imagery.samples };
      } catch {
        // Best-effort only — never block project creation on the seed harvest.
      }
    }
    await writeBrandKitPreview({
      skillsRoot,
      projectsRoot,
      projectId,
      brand: seedBrand,
      status: 'extracting',
      host,
      metadata,
      locale,
    });
    if (designMd) {
      await writeProjectFile(projectsRoot, projectId, 'context/input-DESIGN.md', designMd, { overwrite: true }, metadata);
    }

    // brand.html is the star of the workspace (active tab). The target site stays
    // available as a secondary in-app browser tab so the user can glance at it /
    // clear an anti-bot wall by hand when the agent asks.
    setTabs(db, projectId, {
      tabs: [BRAND_KIT_FILE],
      active: BRAND_KIT_FILE,
      ...(hasWebsiteSource
        ? { browserTabs: [{ id: BRAND_BROWSER_TAB_ID, label: 'Browser', url, title: host }] }
        : {}),
    });

    // Programmatic-first runs immediately, but never blocks the start response.
    // The caller should land in the project with a real user/assistant transcript
    // and the extracting skeleton already persisted while the deterministic
    // harvester finalizes the design system in the background. Best-effort: a
    // blocked, thin, or failing origin leaves the brand `extracting` for the
    // agent/browser fallback to drive from the scaffold instead.
    const programmaticStartedAt = Date.now();
    const programmaticTranscript = runProgrammatic && opts.userDesignSystemsRoot
      ? seedProgrammaticExtractionStartTranscript({
          db,
          conversationId,
          randomId,
          sourceUrl: url,
          sourceLabel: host,
          locale,
          startedAt: programmaticStartedAt,
          ...(opts.transcriptAgent ? { transcriptAgent: opts.transcriptAgent } : {}),
        })
      : null;
    // Persist the transcript handles so EVERY terminal point — finalize success,
    // soft-fail/blocked/timeout, and user stop — can reconcile the synthetic
    // "AMR · Working" row out of its perpetual `running` state, regardless of the
    // racy background timer. Without this the row stays "Working 13m…" forever
    // even after the brand finalizes `ready` in the background.
    if (programmaticTranscript) {
      patchMeta(brandsRoot, id, {
        conversationId,
        extractionTranscriptMessageId: programmaticTranscript.assistantMessageId,
        extractionTranscriptUserMessageId: programmaticTranscript.userMessageId,
        extractionStartedAt: programmaticStartedAt,
      });
    }
    if (runProgrammatic && opts.userDesignSystemsRoot) {
      const programmaticOptions: RunProgrammaticExtractionOptions = {
        id,
        meta,
        projectId,
        brandsRoot,
        userDesignSystemsRoot: opts.userDesignSystemsRoot,
        projectsRoot,
        skillsRoot,
        db,
        logoFallback,
        imageryFallback,
        hasWebsiteSource,
        locale,
        extractionAttemptId,
      };
      if (opts.dataDir) programmaticOptions.dataDir = opts.dataDir;
      if (opts.prefetch) programmaticOptions.prefetch = opts.prefetch;
      if (opts.description) programmaticOptions.description = opts.description;
      if (designMd) programmaticOptions.designMd = designMd;

      launchProgrammaticBackgroundExtraction({
        programmaticOptions,
        programmaticAbortSignal: opts.programmaticAbortSignal,
        fallbackPrompt,
        onBackgroundExtraction: opts.onBackgroundExtraction,
        locale,
      });
    }

    return {
      id,
      projectId,
      conversationId,
      sourceUrl: url,
      status: meta.status,
      ...(draftDesignSystemId ? { designSystemId: draftDesignSystemId } : {}),
    };
  } catch (err) {
    await rollbackBrandExtractionStartup({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      projectId,
      metadata,
      userDesignSystemsRoot: opts.userDesignSystemsRoot,
      draftDesignSystemId,
    });
    throw err;
  }
}

function launchProgrammaticBackgroundExtraction(input: {
  programmaticOptions: RunProgrammaticExtractionOptions;
  programmaticAbortSignal?: AbortSignal | undefined;
  fallbackPrompt: string;
  onBackgroundExtraction?: ((settled: Promise<unknown>) => void) | undefined;
  locale?: string | undefined;
}): Promise<BrandFinalizeResponse | null> {
  const { programmaticOptions, programmaticAbortSignal, fallbackPrompt, locale } = input;
  const { db, brandsRoot, projectsRoot, id, projectId } = programmaticOptions;
  const extractionAttemptId = programmaticOptions.extractionAttemptId;
  const attemptIsCurrent = () =>
    programmaticExtractionAttemptIsCurrent({ brandsRoot, id, extractionAttemptId });

  // Two independent clocks — never one that can kill a slow-but-succeeding
  // origin:
  //   - a 30s SOFT checkpoint flips the synthetic row to the actionable
  //     "taking longer than usual — open the page in Browser / retry / use AI"
  //     terminal WITHOUT aborting, so a heavy site can still finalize in the
  //     background and overwrite the card with success.
  //   - a generous HARD cap aborts only as a runaway backstop; the per-fetch
  //     timeouts already bound the real harvest, so this should rarely fire.
  const hardCap = new AbortController();
  const hardCapTimer = setTimeout(
    () => hardCap.abort(new ProgrammaticExtractionAbortError()),
    PROGRAMMATIC_EXTRACT_TIMEOUT_MS,
  );
  hardCapTimer.unref?.();
  const abortSignal = programmaticAbortSignal
    ? AbortSignal.any([programmaticAbortSignal, hardCap.signal])
    : hardCap.signal;

  let extractionSettled = false;
  const stallTimer = setTimeout(() => {
    if (extractionSettled) return;
    if (!attemptIsCurrent()) return;
    void reconcileProgrammaticExtractionTranscript({
      db,
      brandsRoot,
      projectsRoot,
      brandId: id,
      outcome: 'needs_attention',
      ...(locale ? { locale } : {}),
    }).catch(() => {});
  }, PROGRAMMATIC_STALL_CHECKPOINT_MS);
  stallTimer.unref?.();

  // Defer so the HTTP route returns the ids (making the transcript visible in
  // the left pane) before any synchronous extraction work — notably DESIGN.md
  // parsing — runs.
  const harvest = new Promise<BrandFinalizeResponse | null>((resolve) => {
    setTimeout(() => {
      runProgrammaticExtraction({ ...programmaticOptions, abortSignal }).then(resolve, (err) => {
        if (!isProgrammaticExtractionAbortError(err) && !programmaticAbortSignal?.aborted) {
          console.warn(`[brand] programmatic extraction failed for ${id} — falling back to agent`, err);
        }
        resolve(null);
      });
    }, 0);
  });

  const settled = harvest
    .then(async (result) => {
      // A deliberate user Stop is reconciled by the cancel route, which knows
      // the run was stopped (not given up on). Everything else settles here.
      if (programmaticAbortSignal?.aborted) return result;
      if (!attemptIsCurrent()) return null;
      // Success: finalizeBrandCore already flipped the row to `succeeded` from
      // the authoritative completion point, so there is nothing to do.
      if (result) return result;
      // Give-up (blocked / too thin / unreachable / hard-cap backstop): hand
      // the brand to the agent fallback and retire the synthetic row into the
      // actionable "needs a hand" terminal so it stops counting up forever.
      const latest = readMeta(brandsRoot, id);
      // An anti-bot wall is RECOVERABLE: the user clears it in the in-app Browser
      // tab and "Continue extraction" re-extracts from the rendered DOM. Marking
      // it `failed` here flashes the red "Extraction failed" kit before recovery
      // flips it to `ready` — confusing, because nothing has truly failed yet.
      // Keep blocked origins in the calm, retryable `needs_input` state (the
      // browser-assist card drives them to success) and reserve the terminal
      // `failed` for genuinely unrecoverable give-ups (too thin / unreachable),
      // which hand off to the agent fallback.
      const recoverable = latest?.blocked === true;
      const error = latest?.blockedReason
        ? `Programmatic extraction blocked by ${latest.blockedReason}.`
        : 'Programmatic extraction needs user assistance.';
      patchMeta(brandsRoot, id, {
        status: recoverable ? 'needs_input' : 'failed',
        error,
        extractionTerminalRunId: undefined,
        extractionTerminalError: recoverable ? undefined : error,
      });
      await renderBrandPreviewIntoProject({
        id,
        brandsRoot,
        skillsRoot: programmaticOptions.skillsRoot,
        projectsRoot,
        projectId,
        ...(locale ? { locale } : {}),
      }).catch((err) => {
        console.warn(`[brand] failed to render failed draft preview for ${id}`, err);
      });
      if (!attemptIsCurrent()) return null;
      updateProject(db, projectId, { pendingPrompt: fallbackPrompt });
      return reconcileProgrammaticExtractionTranscript({
        db,
        brandsRoot,
        projectsRoot,
        brandId: id,
        outcome: 'needs_attention',
        ...(locale ? { locale } : {}),
      }).then(() => null);
    })
    .catch((err) => {
      if (isClosedDatabaseError(err)) return null;
      console.warn(`[brand] failed to reconcile programmatic extraction transcript for ${id}`, err);
      return null;
    })
    .finally(() => {
      extractionSettled = true;
      clearTimeout(stallTimer);
      clearTimeout(hardCapTimer);
    });
  input.onBackgroundExtraction?.(settled);

  return settled;
}

export async function continueBrandExtraction(
  opts: ContinueBrandExtractionOptions,
): Promise<StartBrandExtractionResult> {
  const detail = readBrandDetail(opts.brandsRoot, opts.id);
  if (!detail) throw new Error(`brand not found: ${opts.id}`);
  const { meta } = detail;
  const sourceUrl = meta.sourceUrl;
  const projectId = meta.projectId ?? brandProjectId(opts.id);
  const project = getProject(opts.db, projectId);
  if (!project) throw new Error(`brand backing project not found: ${projectId}`);

  const randomId = opts.randomId ?? randomUUID;
  const locale = normalizeBrandKitLocale(opts.locale ?? meta.locale);
  const hasWebsiteSource = /^https?:\/\//i.test(sourceUrl);
  const designMd = readDesignMdInput(opts.brandsRoot, opts.id);
  const hasDesignMdSource = Boolean(designMd) || sourceUrl.startsWith('designmd://');
  const host = hostnameOf(sourceUrl);
  const now = Date.now();
  const extractionAttemptId = newBrandExtractionAttemptId();
  const conversationId = resolveBrandRetryConversationId({
    db: opts.db,
    projectId,
    preferredConversationId: meta.conversationId ?? null,
    randomId,
    now,
  });

  let nextMeta = patchMeta(opts.brandsRoot, opts.id, {
    status: 'extracting',
    error: undefined,
    blocked: false,
    blockedReason: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    conversationId,
    extractionConversationId: conversationId,
    extractionRunId: undefined,
    extractionAttemptId,
  }) ?? { ...meta, status: 'extracting', conversationId, extractionAttemptId, updatedAt: now };

  updateProject(opts.db, projectId, {
    pendingPrompt: null,
    designSystemId: nextMeta.designSystemId ?? project.designSystemId ?? null,
    metadata: {
      ...(project.metadata ?? {}),
      kind: 'brand',
      importedFrom: 'brand-extraction',
      entryFile: BRAND_KIT_FILE,
      brandId: opts.id,
      brandSourceUrl: sourceUrl,
      ...(nextMeta.designSystemId ? { brandDesignSystemId: nextMeta.designSystemId } : {}),
    },
    updatedAt: now,
  });

  await renderBrandPreviewIntoProject({
    id: opts.id,
    brandsRoot: opts.brandsRoot,
    skillsRoot: opts.skillsRoot,
    projectsRoot: opts.projectsRoot,
    projectId,
    locale,
  }).catch((err) => {
    console.warn(`[brand] failed to render continuing preview for ${opts.id}`, err);
  });

  const transcript = seedProgrammaticExtractionStartTranscript({
    db: opts.db,
    conversationId,
    randomId,
    sourceUrl,
    sourceLabel: host,
    locale,
    startedAt: now,
    ...(opts.transcriptAgent ? { transcriptAgent: opts.transcriptAgent } : {}),
  });
  nextMeta = patchMeta(opts.brandsRoot, opts.id, {
    conversationId,
    extractionTranscriptMessageId: transcript.assistantMessageId,
    extractionTranscriptUserMessageId: transcript.userMessageId,
    extractionStartedAt: now,
  }) ?? nextMeta;

  const fallbackPrompt = brandExtractionFallbackPrompt({
    url: sourceUrl,
    brandId: opts.id,
    host,
    hasWebsiteSource,
    hasDesignMdSource,
  });
  const programmaticOptions: RunProgrammaticExtractionOptions = {
    id: opts.id,
    meta: nextMeta,
    projectId,
    brandsRoot: opts.brandsRoot,
    userDesignSystemsRoot: opts.userDesignSystemsRoot,
    projectsRoot: opts.projectsRoot,
    skillsRoot: opts.skillsRoot,
    db: opts.db,
    hasWebsiteSource,
    locale,
    extractionAttemptId,
  };
  if (opts.dataDir) programmaticOptions.dataDir = opts.dataDir;
  if (opts.prefetch) programmaticOptions.prefetch = opts.prefetch;
  if (opts.logoFallback) programmaticOptions.logoFallback = opts.logoFallback;
  if (opts.imageryFallback) programmaticOptions.imageryFallback = opts.imageryFallback;
  if (designMd) programmaticOptions.designMd = designMd;

  launchProgrammaticBackgroundExtraction({
    programmaticOptions,
    programmaticAbortSignal: opts.programmaticAbortSignal,
    fallbackPrompt,
    onBackgroundExtraction: opts.onBackgroundExtraction,
    locale,
  });

  return {
    id: opts.id,
    projectId,
    conversationId,
    sourceUrl,
    status: 'extracting',
    ...(nextMeta.designSystemId ? { designSystemId: nextMeta.designSystemId } : {}),
    ...(detail.brand?.name ? { brandName: detail.brand.name } : {}),
  };
}

function resolveBrandRetryConversationId(input: {
  db: Parameters<typeof insertProject>[0];
  projectId: string;
  preferredConversationId?: string | null;
  randomId: () => string;
  now: number;
}): string {
  const conversations = listConversations(input.db, input.projectId);
  const preferredStillExists = input.preferredConversationId
    ? conversations.some((conversation) => conversation.id === input.preferredConversationId)
    : false;
  const existingConversationId = preferredStillExists
    ? input.preferredConversationId
    : conversations[0]?.id;
  if (existingConversationId) return existingConversationId;

  const conversationId = input.randomId();
  insertConversation(input.db, {
    id: conversationId,
    projectId: input.projectId,
    title: null,
    sessionMode: 'design',
    createdAt: input.now,
    updatedAt: input.now,
  });
  return conversationId;
}

const PROGRAMMATIC_STALL_CHECKPOINT_MS = 30_000;

/** Hard runaway backstop: abort the background programmatic-first extraction so
 *  a pathological origin can never leak a forever-pending promise. Generous on
 *  purpose — the per-fetch 8s timeouts bound the real harvest, so a healthy
 *  (even heavy) site finalizes well before this. */
const PROGRAMMATIC_EXTRACT_TIMEOUT_MS = 180_000;

export { isProgrammaticExtractionAbortError } from '../core/index.js';

export type PrefetchFn = (
  url: string,
  brandDir: string,
  opts?: { signal?: AbortSignal },
) => Promise<PrefetchResult | null>;

export interface RunProgrammaticExtractionOptions {
  id: string;
  meta: BrandMeta;
  projectId: string;
  brandsRoot: string;
  userDesignSystemsRoot: string;
  projectsRoot: string;
  skillsRoot: string;
  db: Parameters<typeof insertProject>[0];
  dataDir?: string;
  description?: string;
  designMd?: string;
  hasWebsiteSource?: boolean;
  /** Deterministic material harvester; defaults to the live network prefetch. */
  prefetch?: PrefetchFn;
  logoFallback?: LogoFallbackFn;
  imageryFallback?: ImageryFallbackFn;
  locale?: string;
  abortSignal?: AbortSignal;
  extractionAttemptId?: string;
}

/**
 * Programmatic-first extraction: harvest the site deterministically (logo,
 * palette, typography, copy, cover imagery, source URL), synthesize a valid
 * design system with `brandFromMaterial` (NO LLM), and finalize it immediately
 * so the user lands on a usable, applyable design system within seconds — the
 * "aha". The async AI enrichment pass then refines it to full fidelity and
 * re-finalizes in place (reusing the same `user:<id>` design system).
 *
 * Best-effort: a blocked, too-thin, or unreachable origin yields `null` and
 * the brand stays `extracting`, so the AI pass can take over.
 */
export async function runProgrammaticExtraction(
  opts: RunProgrammaticExtractionOptions,
): Promise<BrandFinalizeResponse | null> {
  const { id, meta, brandsRoot, prefetch = prefetchBrand } = opts;
  throwIfProgrammaticExtractionNotCurrent(opts);
  const brandDir = resolveBrandFile(brandsRoot, id, []);
  if (!brandDir) return null;

  if (opts.designMd?.trim()) {
    throwIfProgrammaticExtractionNotCurrent(opts);
    const brand = brandFromDesignMd({
      markdown: opts.designMd,
      sourceUrl: meta.sourceUrl,
      description: opts.description,
      fallbackName: hostnameOf(meta.sourceUrl),
    });
    if (brand) {
      const guideMd = brandGuideMd(brand);
      throwIfProgrammaticExtractionNotCurrent(opts);
      const finalized = await finalizeBrandCore({ ...opts, brand, guideMd });
      throwIfProgrammaticExtractionNotCurrent(opts);
      updateProject(opts.db, opts.projectId, {
        pendingPrompt: brandExtractionPrompt({
          url: meta.sourceUrl,
          brandId: id,
          host: hostnameOf(meta.sourceUrl),
          hasWebsiteSource: opts.hasWebsiteSource === true,
          hasDesignMdSource: true,
        }),
      });
      return finalized;
    }
  }

  if (opts.hasWebsiteSource === false) return null;

  throwIfProgrammaticExtractionNotCurrent(opts);
  const material = await prefetch(
    meta.sourceUrl,
    brandDir,
    opts.abortSignal ? { signal: opts.abortSignal } : undefined,
  );
  throwIfProgrammaticExtractionNotCurrent(opts);
  if (!material) return null;
  if (material.blocked) {
    // Anti-bot wall: persist the signal so the web can prompt the user to clear
    // it in the in-app browser tab and re-extract from the rendered DOM. The
    // brand stays `extracting`, so the agent fallback still works either way.
    patchMeta(brandsRoot, id, { blocked: true, blockedReason: 'Cloudflare' });
    return null;
  }
  if (material.thin) return null;

  const brand = brandFromMaterial(material, meta.sourceUrl);
  const guideMd = brandGuideMd(brand);
  throwIfProgrammaticExtractionNotCurrent(opts);
  const finalized = await finalizeBrandCore({ ...opts, brand, guideMd });
  throwIfProgrammaticExtractionNotCurrent(opts);
  updateProject(opts.db, opts.projectId, {
    pendingPrompt: brandExtractionPrompt({
      url: meta.sourceUrl,
      brandId: id,
      host: hostnameOf(meta.sourceUrl),
      hasWebsiteSource: true,
      hasDesignMdSource: false,
    }),
  });
  return finalized;
}

export interface ExtractBrandFromHtmlOptions
  extends Omit<RunProgrammaticExtractionOptions, 'prefetch' | 'designMd' | 'projectId'> {
  /** Backing project to sync the finalized system into; defaults to the brand's
   *  recorded project. */
  projectId?: string;
  /** Rendered DOM (`document.documentElement.outerHTML`) the web read out of the
   *  in-app browser tab after the user cleared an anti-bot wall. */
  html: string;
  /** Stylesheet text + computed-style harvest collected from the rendered page. */
  css?: string;
  /** Page URL used as the asset base; defaults to the brand's `sourceUrl`. */
  baseUrl?: string;
}

/**
 * Whether a harvest of already-rendered browser DOM produced essentially
 * nothing a brand can be synthesized from. Used only by the post-wall
 * `extract-from-html` path, where the page is real (the user cleared the wall),
 * so this is intentionally far more permissive than `PrefetchResult.thin`:
 *
 *  - A sparse palette (`< 3` non-extreme colors) is NOT disqualifying on its
 *    own. Minimalist brands (black/white/red) and transient computed-style
 *    reads routinely land few chromatic colors yet still describe a real site.
 *  - Missing headings/description is NOT disqualifying on its own either.
 *
 * We bail only when the harvest is `blocked` (the serialized DOM still looked
 * like the bare anti-bot wall, e.g. read too early) or when both real page copy
 * AND a real palette are absent (a blank/"still loading" placeholder read). A
 * harvested logo is deliberately NOT counted as a usable signal here: the
 * favicon-service fallback returns an icon for essentially any hostname, so it
 * would wrongly rescue an empty/placeholder page.
 */
export function browserHarvestIsUnusable(material: PrefetchResult): boolean {
  if (material.blocked) return true;
  const hasColor = material.colors.some((c) => !c.extreme);
  const hasCopy =
    material.headings.length > 0 ||
    Boolean(material.description) ||
    material.paragraphs.length > 0 ||
    material.navLabels.length > 0;
  return !hasColor && !hasCopy;
}

/**
 * Re-run programmatic extraction against HTML the web already rendered (the
 * in-app browser tab the user unblocked), instead of fetching. Same
 * harvest → synthesize → finalize pipeline as `runProgrammaticExtraction`, but
 * fed the post-wall DOM via `prefetchFromHtml` (no network fetch, no Chrome).
 * On success the brand is finalized `ready` and its `user:<id>` design system
 * registered (reusing the existing id — never duplicated). Returns null when the
 * provided page is still too thin to synthesize a system.
 */
export async function extractBrandFromHtml(
  opts: ExtractBrandFromHtmlOptions,
): Promise<BrandFinalizeResponse | null> {
  const { id, meta, brandsRoot } = opts;
  const brandDir = resolveBrandFile(brandsRoot, id, []);
  if (!brandDir) return null;
  const projectId = opts.projectId ?? meta.projectId ?? brandProjectId(id);
  const baseUrl = opts.baseUrl?.trim() || meta.sourceUrl;
  const extractionAttemptId = opts.extractionAttemptId ?? newBrandExtractionAttemptId();
  const currentMeta = patchMeta(brandsRoot, id, {
    status: 'extracting',
    error: undefined,
    blocked: false,
    blockedReason: undefined,
    extractionTerminalRunId: undefined,
    extractionTerminalError: undefined,
    extractionAttemptId,
  }) ?? { ...meta, status: 'extracting', extractionAttemptId, updatedAt: Date.now() };

  const material = await prefetchFromHtml(opts.html, opts.css ?? '', baseUrl, brandDir);
  throwIfProgrammaticExtractionNotCurrent({ ...opts, extractionAttemptId });
  // This DOM was read out of the in-app browser tab AFTER the user cleared the
  // anti-bot wall, so it is a real page — be far more permissive than the
  // network prefetch's `thin` gate. A content-rich page with a sparse palette
  // (a minimalist black/white/red brand like the Economist, or a transiently
  // incomplete computed-style read) MUST still synthesize: `brandFromMaterial`
  // falls back to seed defaults for missing colors and the AI enrichment pass
  // refines later. Only bail when the harvest captured nothing a brand can be
  // built from — which in practice means the read grabbed the wall/blank page
  // (`blocked`) or an empty document, not the unblocked site.
  if (!material || browserHarvestIsUnusable(material)) return null;

  const brand = brandFromMaterial(material, currentMeta.sourceUrl);
  const guideMd = brandGuideMd(brand);
  const finalized = await finalizeBrandCore({
    ...opts,
    projectId,
    meta: currentMeta,
    brand,
    guideMd,
    extractionAttemptId,
  });
  throwIfProgrammaticExtractionNotCurrent({ ...opts, extractionAttemptId });
  // Flip the project to enrichment mode so a follow-up "AI Optimize" refines the
  // same design system in place rather than re-running the blocked extraction.
  updateProject(opts.db, projectId, {
    pendingPrompt: brandExtractionPrompt({
      url: currentMeta.sourceUrl,
      brandId: id,
      host: hostnameOf(currentMeta.sourceUrl),
      hasWebsiteSource: true,
      hasDesignMdSource: false,
    }),
  });
  return finalized;
}

function brandExtractionPrompt(input: {
  url: string;
  brandId: string;
  host: string;
  hasWebsiteSource?: boolean;
  hasDesignMdSource?: boolean;
}): string {
  if (input.hasDesignMdSource && !input.hasWebsiteSource) {
    return [
      `This is a DESIGN SYSTEM ENRICHMENT task for ${input.host}.`,
      `Source: pasted DESIGN.md (${input.url})`,
      `Brand id: ${input.brandId}`,
      '',
      'A usable design system has ALREADY been parsed from `context/input-DESIGN.md`, finalized programmatically, and registered. The design-system page (`brand.html`) is open as the active tab, already in the `ready` state and applyable everywhere RIGHT NOW. Your job is to ENRICH that provisional system in place: inspect `context/input-DESIGN.md`, `DESIGN.md`, `brand.json`, `system/variables.css`, `system/theme.json`, and the component kit pages; then replace weak guesses with clearer token roles, component guidance, voice, and implementation notes.',
      '',
      'Do not create a duplicate design system. Keep the same registered user design-system id. Update `brand.json` and `BRAND.md` incrementally, run `od brand preview ' + input.brandId + '` after field groups, then run `od brand finalize ' + input.brandId + '` when ready.',
      '',
      'Focus areas:',
      '- Normalize color roles from the pasted DESIGN.md into background, surface, foreground, muted, border, accent, and accent-secondary.',
      '- Strengthen typography guidance, spacing/radius/layout posture, component kit coverage, and do/don\'t rules from the source prose.',
      '- Keep `DESIGN.md`, `brand.json`, `system/kit.html`, `system/kit.dark.html`, token JSON/CSS files, and artifact previews coherent.',
      '',
      'Finish by summarizing which tokens and component-kit files changed.',
    ].join('\n');
  }

  const designMdNote = input.hasDesignMdSource
    ? ' The user also pasted `context/input-DESIGN.md`; treat its machine-readable tokens and prose as source evidence and authoritative overrides when they conflict with rough website guesses.'
    : '';
  return [
    `This is a DESIGN SYSTEM ENRICHMENT task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'A usable design system has ALREADY been extracted programmatically and registered — the daemon harvested the site deterministically (logo, palette, typography, a one-line description, cover imagery, source URL) and the design-system page (`brand.html`) is open as the active tab, already in the `ready` state and applyable everywhere RIGHT NOW. Your job is to ENRICH that provisional design system into the full, precise version: re-measure anything the deterministic pass got approximately, add what it could not infer (voice & tone, imagery direction, layout posture, accent-secondary), and replace any weak guesses with measured truth.' + designMdNote + ' The target site is also open in a secondary in-app Browser tab. This task already contains the full brand-extract workflow inline (the numbered steps below) — follow it directly. Do NOT try to load or invoke a `brand-extract` skill, `Skill`, or any slash command: none is registered here and the call will fail. Drive and observe the site with the `agent-browser` tool. Do not guess — measure.',
    '',
    'Work the branding-agent chain, optimizing for PROGRESSIVE fill-in (never batch everything to the end). The page is already populated from the programmatic pass — refine it module by module so the user watches it sharpen:',
    '',
    '1. MEASURE — drive the site with agent-browser. Snapshot it, then harvest the real design language: frequency-ranked color literals (background / surface / foreground / muted / border / accent / accent-secondary), the @font-face + font-family declarations, and representative headings + copy for voice.',
    '   - LOGO (extract MULTIPLE candidates): save every logo you can find as a file under `logos/` — the inline header/nav SVG (write the literal `<svg>…</svg>` markup verbatim to `logos/header.svg`, do NOT just reference it), any `<img>` logo, the `apple-touch-icon`, the `favicon`, and the `og:image`. Set `logo.primary` to the best vector/transparent lockup and list the rest in `logo.alternates` (the kit page shows them as switchable thumbnails). NEVER leave `logo.primary` empty when the site has any mark — fetch the asset URLs directly and save real files. (The daemon also auto-fetches a favicon/og:image fallback so the page is never logo-less, but that is a safety net, not a substitute for the real wordmark.)',
    '   - FONTS: record each real family in `typography` with its `fallbacks` and `weights`. When the family is on Google Fonts, set `googleFontsUrl` so finalize self-hosts it and specimens render for real; otherwise note it is proprietary. The kit page renders a big "Ag" specimen tile per family, so a correct `family` + `googleFontsUrl` makes them show in the real typeface.',
    '   - IMAGERY (save 6–8 of the site’s LARGE / COVER / HERO images): this is the Images module. Harvest the site’s actual big representative pictures — the `og:image`/`twitter:image` social card, the hero/banner art, the largest `<img>` (use the highest-res `srcset`/`<picture>` source), CSS `background-image` hero blocks, product/app screenshots, and illustration/photography samples. Filter by RENDERED size: keep only big images (roughly ≥320px on the long edge) and DROP icons, sprites, logos, avatars, and tracking pixels. Save each as a file under `imagery/` and list them in `brand.json` as `imagery.samples: [{ "file": "imagery/<file>", "kind": "cover|hero|product|illustration|photo", "caption": "short label" }]`. The kit page renders these as a clean labeled Images gallery (a thumbnail grid). Fetch the asset URLs directly; pick 6–8 varied, on-brand images — never UI chrome or icons. (The daemon also runs a deterministic cover/hero-image fallback at finalize so the gallery is rarely empty, but that safety net is no substitute for picking the real hero images yourself.)',
    '   - ANTI-BOT WALL: if the page is a Cloudflare / DataDome / "Just a moment…" / "Verify you are human" interstitial instead of the real site, STOP and emit a `<question-form>` asking the user to complete the verification in the browser, then Continue. Do NOT try to bypass it yourself. When the user submits the form, re-snapshot and resume.',
    '',
    '2. SYNTHESIZE INCREMENTALLY — write `brand.json` AS SOON AS you have the name, a couple of colors, and a logo candidate (do not wait for everything), then run `od brand preview ' + input.brandId + '` and tell the user it is filling in. It must parse as JSON and use exactly the seven color roles (background, surface, foreground, muted, border, accent, accent-secondary), each with `hex` (#rrggbb), `oklch`, `name`, `usage`; plus `name`, `tagline`, `description`, `sourceUrl`, `logo` ({ primary, alternates, notes } with `logos/<file>` paths), `typography` ({ display, body, mono? } each { family, fallbacks[], weights[], googleFontsUrl? }), `voice`, `imagery` (incl. `samples` — the `imagery/<file>` images you saved), and `layout`. Never invent colors from memory — pick them from what you measured.',
    '   - PREVIEW AFTER EACH FIELD GROUP, do not batch to the end. The kit fills in live, so after you measure and add each group — (a) colors, (b) typography/fonts, (c) logo candidates, (d) cover/hero imagery samples, (e) voice & tone, (f) imagery/layout posture — update `brand.json` and re-run `od brand preview ' + input.brandId + '`. Partial data renders the filled modules and keeps skeletons for the rest, which is exactly the progressive "filling in" the user should watch. Also write `BRAND.md`, a prose brand guide an autonomous design agent can follow.',
    '',
    '3. REBUILD & RE-REGISTER — when `brand.json` is enriched, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). That re-validates it, re-derives the light/dark/compact design tokens and the six design-system artifacts (landing, deck, poster, email, newsletter, form), and UPDATES the already-registered design system in place (same id — never a duplicate), so every template that already uses it picks up the sharper result. Fix `brand.json` and re-run if it reports a validation error.',
    '',
    'Finish by pointing the user at the enriched brand.html (logo, palette, typography, voice) and the design-system assets they can now preview, and confirm the design system was updated.',
  ].join('\n');
}

/** Prompt used while the programmatic harvest is not known-good yet. It must
 * not claim the design system is already ready: blocked/thin sites stay on
 * this path and need the agent to do the initial extraction from the scaffold. */
function brandExtractionFallbackPrompt(input: {
  url: string;
  brandId: string;
  host: string;
  hasWebsiteSource?: boolean;
  hasDesignMdSource?: boolean;
}): string {
  if (input.hasDesignMdSource && !input.hasWebsiteSource) {
    return [
      `This is a DESIGN SYSTEM EXTRACTION task for ${input.host}.`,
      `Source: pasted DESIGN.md (${input.url})`,
      `Brand id: ${input.brandId}`,
      '',
      'The daemon created a live design-system scaffold and saved the pasted source at `context/input-DESIGN.md`. A ready design system may already be registered from the programmatic parser; if not, use the pasted file as the canonical source and complete it.',
      '',
      'Read `context/input-DESIGN.md`, then update `brand.json`, `BRAND.md`, and `DESIGN.md` progressively. Run `od brand preview ' + input.brandId + '` after meaningful field groups, then `od brand finalize ' + input.brandId + '` to register or update the same design system in place.',
      '',
      'Finish by pointing the user at the completed brand.html and reusable design-system assets.',
    ].join('\n');
  }

  const designMdNote = input.hasDesignMdSource
    ? ' The user also pasted `context/input-DESIGN.md`; read it before drafting and let its tokens/prose override weaker URL-derived guesses.'
    : '';
  return [
    `This is a DESIGN SYSTEM EXTRACTION task for ${input.host}.`,
    `Source URL: ${input.url}`,
    `Brand id: ${input.brandId}`,
    '',
    'The daemon opened a live extraction scaffold (`brand.html`) in the project, but a ready design system is NOT guaranteed yet. Treat the page as an empty/in-progress workspace until you have measured the target site and written `brand.json`; do not assume a registered `brand.json` or design system already exists.' + designMdNote,
    '',
    'This task already contains the full brand-extract workflow inline — follow it directly. Do NOT try to load or invoke a `brand-extract` skill, `Skill`, or any slash command: none is registered here and the call will fail. Drive and observe the target site with the `agent-browser` tool. Measure before you synthesize: capture the real colors, fonts, logo candidates, representative imagery, voice, and layout posture. If the page is an anti-bot verification interstitial, emit a `<question-form>` asking the user to complete verification in the browser, then continue after they respond.',
    '',
    'Write `brand.json` as soon as you have the name, a couple of measured colors, and a logo candidate, then run `od brand preview ' + input.brandId + '` so the scaffold fills in progressively. Keep updating `brand.json`, `BRAND.md`, saved `logos/`, fonts, and `imagery/` samples as you measure each field group.',
    '',
    'When the kit is complete and validates, run `od brand finalize ' + input.brandId + '` (add `--json` for machine output). Fix validation errors and re-run finalize until the brand is registered and the design-system assets are ready.',
    '',
    'Finish by pointing the user at the completed brand.html and the reusable design-system assets.',
  ].join('\n');
}
