// Authors: Leon Aburime using Claude Fable 5
// @ts-nocheck — carried over verbatim from server.ts's file-level @ts-nocheck.
// The moved bodies are untyped JS-in-TS; typing them is a later effort and new
// sibling code must NOT copy this.
/** @module server/marketplace/seed
 * Bundled-plugin marketplace seeding.
 *
 * Owns the "official" marketplace identity + source-repo constants and the
 * helpers that let the daemon serve its own bundled plugin registry manifests
 * before (or instead of) fetching them over the network:
 *
 *   - `defaultMarketplaceSeedConfig` — trust + url for a registry id.
 *   - `bundledPluginRegistrySource`  — rewrite a bundled plugin's on-disk path
 *     into a `github:…` source ref.
 *   - `marketplaceSeedManifestText`  — read (and, for official, merge bundled
 *     entries into) a seed manifest.
 *   - `createMarketplaceFetcher`     — a fetch shim that answers from the seed
 *     manifest when the URL matches, else falls back to real `fetch`.
 *   - `mergeMarketplaceEntries` / `isPathWithin` — pure helpers.
 *
 * Three daemon-init directory singletons (bundled-plugins dir, project root,
 * plugin-registry dir) are passed in explicitly rather than closed over, so
 * this module has no dependency back on server.ts. server.ts owns those dirs
 * and threads them at each call site.
 *
 * Extracted from apps/daemon/src/server.ts (strangler-fig slice 5a); bodies are
 * byte-identical apart from those directory references becoming parameters.
 */

import path from 'node:path';
import fs from 'node:fs';
import {
  marketplaceManifestUrlForRegistry,
  marketplaceRegistryIdFromUrl,
} from '../../plugins/marketplaces.js';

export const OFFICIAL_MARKETPLACE_ID = 'official';
export const OFFICIAL_PLUGIN_SOURCE_REPO = 'github:nexu-io/open-design@main';

export function defaultMarketplaceSeedConfig(id) {
  return {
    trust: id === OFFICIAL_MARKETPLACE_ID ? 'official' : 'restricted',
    url:   marketplaceManifestUrlForRegistry(id),
  };
}

export function bundledPluginRegistrySource(sourcePath, bundledPluginsDir, projectRoot) {
  if (isPathWithin(bundledPluginsDir, sourcePath)) {
    const rel = path.relative(bundledPluginsDir, sourcePath).split(path.sep).join('/');
    return `${OFFICIAL_PLUGIN_SOURCE_REPO}/plugins/_official/${rel}`;
  }
  const rel = path.relative(projectRoot, sourcePath).split(path.sep).join('/');
  if (!rel || rel.startsWith('..')) return sourcePath;
  return `${OFFICIAL_PLUGIN_SOURCE_REPO}/${rel}`;
}

export function isPathWithin(base, target) {
  const relativePath = path.relative(path.resolve(base), path.resolve(target));
  return (
    relativePath === '' ||
    (relativePath.length > 0 &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath))
  );
}

export function mergeMarketplaceEntries(manifestText, entries) {
  try {
    const parsed = JSON.parse(manifestText);
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins : [];
    const seen = new Set(plugins.map((entry) => String(entry?.name ?? '').toLowerCase()));
    const generated = entries.filter((entry) => {
      const key = String(entry.name ?? '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return JSON.stringify({
      ...parsed,
      metadata: {
        ...(parsed.metadata && typeof parsed.metadata === 'object' ? parsed.metadata : {}),
        bundledPreinstallCount: entries.length,
      },
      plugins: [...plugins, ...generated],
    });
  } catch {
    return manifestText;
  }
}

export async function marketplaceSeedManifestText(id, bundledMarketplaceEntries, pluginRegistryDir) {
  const manifestPath = path.join(pluginRegistryDir, id, 'open-design-marketplace.json');
  if (!fs.existsSync(manifestPath)) return null;
  let manifestText = await fs.promises.readFile(manifestPath, 'utf8');
  if (id === OFFICIAL_MARKETPLACE_ID && bundledMarketplaceEntries.length > 0) {
    manifestText = mergeMarketplaceEntries(manifestText, bundledMarketplaceEntries);
  }
  return manifestText;
}

export function createMarketplaceFetcher(seedId, bundledMarketplaceEntries, pluginRegistryDir) {
  return async (url) => {
    const registryId = marketplaceRegistryIdFromUrl(url);
    if (registryId && (!seedId || registryId === seedId)) {
      const manifestText = await marketplaceSeedManifestText(registryId, bundledMarketplaceEntries, pluginRegistryDir);
      if (manifestText != null) {
        return {
          ok:     true,
          status: 200,
          text:   async () => manifestText,
        };
      }
    }
    const response = await fetch(url, { redirect: 'follow' });
    return {
      ok:     response.ok,
      status: response.status,
      text:   () => response.text(),
    };
  };
}
