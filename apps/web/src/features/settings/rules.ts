// Pure rules for the settings slice: provider-model cache keying/merging plus
// the Composio credential-state derivation. No React, no transport, no DOM, so
// they test against `../../types`/`@open-design/contracts` with zero doubles
// (ADR 0002).
import type { ApiProtocol, ProviderModelOption } from '../../types';
import type { ComposioCredentialState } from './types';

/**
 * FNV-1a fingerprint of a secret. Only the length + hash leave this module, so a
 * provider's API key can key the model cache without the raw secret ever
 * appearing in a cache key.
 */
function fingerprintSecret(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * The cache key for a provider's discovered models: protocol + normalized base
 * URL + fingerprinted API key (+ Azure api-version when it matters). Identical
 * credentials collapse to the same key so a discovery fetch is reused; a changed
 * secret invalidates it.
 */
export function providerModelsCacheKey(
  protocol: ApiProtocol,
  baseUrl: string,
  apiKey: string,
  apiVersion = '',
): string {
  return [
    protocol,
    baseUrl.trim().replace(/\/+$/, ''),
    fingerprintSecret(apiKey.trim()),
    protocol === 'azure' ? apiVersion.trim() : '',
  ].join('\n');
}

/**
 * Merge freshly-fetched provider models with the protocol's suggested model ids
 * into one de-duplicated option list, fetched models first. Empty/duplicate ids
 * are dropped and each label falls back to its id.
 */
export function mergeProviderModelOptions(
  fetchedModels: readonly ProviderModelOption[],
  suggestedModelIds: readonly string[],
): ProviderModelOption[] {
  const seen = new Set<string>();
  const out: ProviderModelOption[] = [];
  const add = (model: ProviderModelOption) => {
    const id = model.id.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, label: model.label.trim() || id });
  };
  for (const model of fetchedModels) add(model);
  for (const id of suggestedModelIds) add({ id, label: id });
  return out;
}

/**
 * Derive the Composio credential lifecycle state from the stored config. A saved
 * key with a fresh draft is `saved-pending`; a saved key alone is `saved`; a
 * draft with nothing saved is `pending-new`; otherwise `empty`.
 */
export function deriveComposioCredentialState(
  composio: { apiKey?: string; apiKeyConfigured?: boolean } | null | undefined,
): ComposioCredentialState {
  const hasPendingEdit = Boolean(composio?.apiKey?.trim());
  const hasSavedKey = Boolean(composio?.apiKeyConfigured);
  if (hasSavedKey && hasPendingEdit) return 'saved-pending';
  if (hasSavedKey) return 'saved';
  if (hasPendingEdit) return 'pending-new';
  return 'empty';
}
