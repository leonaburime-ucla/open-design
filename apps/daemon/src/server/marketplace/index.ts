// Authors: Leon Aburime using Claude Fable 5
/** @module server/marketplace
 * Barrel for bundled-plugin marketplace seeding. See ./seed.ts for the
 * responsibility summary; server.ts threads its three directory singletons
 * into these helpers at each call site.
 */

export {
  OFFICIAL_MARKETPLACE_ID,
  OFFICIAL_PLUGIN_SOURCE_REPO,
  defaultMarketplaceSeedConfig,
  bundledPluginRegistrySource,
  isPathWithin,
  mergeMarketplaceEntries,
  marketplaceSeedManifestText,
  createMarketplaceFetcher,
} from './seed.js';
