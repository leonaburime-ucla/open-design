/** @module brands/index
 * Public brands capability barrel for extraction, finalization, catalog, routes, and deterministic generation helpers.
 * Runtime callers outside brands/ must import from this root barrel; it explicitly re-exports only the supported public surface.
 */

export type {
  ColorCandidate,
  FontCandidate,
  LogoCandidate,
  PrefetchResult,
} from './core/index.js';
export { brandFromMaterial } from './generation/index.js';
export { brandToDesignMd, brandGuideMd } from './core/index.js';
export { extractJsonBlock, validateBrand } from './core/index.js';
export type {
  StartBrandExtractionOptions,
  StartBrandExtractionResult,
  ContinueBrandExtractionOptions,
  PrefetchFn,
  RunProgrammaticExtractionOptions,
  ExtractBrandFromHtmlOptions,
} from './extraction/index.js';
export {
  startBrandExtraction,
  continueBrandExtraction,
  isProgrammaticExtractionAbortError,
  runProgrammaticExtraction,
  browserHarvestIsUnusable,
  extractBrandFromHtml,
} from './extraction/index.js';
export type {
  ProgrammaticExtractionOutcome,
} from './transcript/index.js';
export {
  backfillBrandExtractionTranscriptForProject,
  reconcileProgrammaticExtractionTranscript,
} from './transcript/index.js';
export type {
  FinalizeBrandOptions,
} from './finalize/index.js';
export { finalizeBrand } from './finalize/index.js';
export type {
  RenderBrandPreviewOptions,
  RenderBrandPreviewResult,
} from './preview/index.js';
export { renderBrandPreviewIntoProject } from './preview/index.js';
export {
  listBrandSummaries,
  readBrandDetail,
  removeBrand,
  resolveBrandLogoPath,
} from './catalog/index.js';
export type { BrandRoutesDeps } from './routes/index.js';
export { registerBrandRoutes } from './routes/index.js';
