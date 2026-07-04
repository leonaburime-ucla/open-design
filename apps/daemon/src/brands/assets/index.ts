/** @module assets/index
 * Asset harvesting layer: browser prefetch, fonts, logo fallback, imagery fallback, and seed fallback.
 * Other concerns import this barrel instead of reaching into individual asset files.
 */

export * from './chrome.js';
export * from './fonts.js';
export * from './imagery-fallback.js';
export type { FallbackLogo, LogoFallbackFn, LogoSlot } from './logo-fallback.js';
export { adoptExistingLogos, ensureLogoFallback, harvestFallbackLogos } from './logo-fallback.js';
export * from './prefetch.js';
export * from './seed-fallback.js';
