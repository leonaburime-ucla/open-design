// Pure-rules tests for the settings slice: no doubles, just `contracts`/app
// types (ADR 0002). Covers the provider-model cache keying/merging and the
// Composio credential-state derivation now homed in the slice.
import { describe, expect, it } from 'vitest';
import type { ProviderModelOption } from '../../../src/types';
import {
  deriveComposioCredentialState,
  mergeProviderModelOptions,
  providerModelsCacheKey,
} from '../../../src/features/settings';

describe('providerModelsCacheKey', () => {
  it('fingerprints the API key instead of embedding the raw secret', () => {
    const key = providerModelsCacheKey(
      'anthropic',
      'https://api.anthropic.com/',
      'sk-secret-value',
    );
    expect(key).toContain('https://api.anthropic.com');
    expect(key).not.toContain('sk-secret-value');
  });

  it('normalizes a trailing slash on the base URL to a stable key', () => {
    expect(
      providerModelsCacheKey('anthropic', 'https://api.anthropic.com/', 'sk'),
    ).toBe(
      providerModelsCacheKey('anthropic', 'https://api.anthropic.com', 'sk'),
    );
  });

  it('differs when the secret differs', () => {
    expect(
      providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-a'),
    ).not.toBe(
      providerModelsCacheKey('openai', 'https://api.openai.com/v1', 'sk-b'),
    );
  });

  it('folds the Azure api-version into the key only for the azure protocol', () => {
    expect(
      providerModelsCacheKey('azure', 'https://x.azure.com', 'k', '2024-01'),
    ).not.toBe(
      providerModelsCacheKey('azure', 'https://x.azure.com', 'k', '2024-02'),
    );
    expect(
      providerModelsCacheKey('openai', 'https://x', 'k', '2024-01'),
    ).toBe(
      providerModelsCacheKey('openai', 'https://x', 'k', '2024-02'),
    );
  });
});

describe('mergeProviderModelOptions', () => {
  const fetched: ProviderModelOption[] = [
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: '' },
  ];

  it('lists fetched models first, then suggested ids not already present', () => {
    const merged = mergeProviderModelOptions(fetched, ['gpt-4o', 'o1']);
    expect(merged.map((m) => m.id)).toEqual(['gpt-4o', 'gpt-4o-mini', 'o1']);
  });

  it('falls back to the id when a label is blank', () => {
    const merged = mergeProviderModelOptions(fetched, []);
    expect(merged.find((m) => m.id === 'gpt-4o-mini')?.label).toBe('gpt-4o-mini');
  });

  it('drops empty and duplicate ids', () => {
    const merged = mergeProviderModelOptions(
      [{ id: '  ', label: 'blank' }, { id: 'a', label: 'A' }],
      ['a', 'b'],
    );
    expect(merged.map((m) => m.id)).toEqual(['a', 'b']);
  });
});

describe('deriveComposioCredentialState', () => {
  it('is empty with neither a saved key nor a draft', () => {
    expect(deriveComposioCredentialState(null)).toBe('empty');
    expect(deriveComposioCredentialState({})).toBe('empty');
  });

  it('is pending-new with only a typed draft', () => {
    expect(deriveComposioCredentialState({ apiKey: 'draft' })).toBe('pending-new');
  });

  it('is saved with only a configured key', () => {
    expect(deriveComposioCredentialState({ apiKeyConfigured: true })).toBe('saved');
  });

  it('is saved-pending with a saved key plus a fresh draft', () => {
    expect(
      deriveComposioCredentialState({ apiKey: 'draft', apiKeyConfigured: true }),
    ).toBe('saved-pending');
  });

  it('treats a whitespace-only draft as no draft', () => {
    expect(deriveComposioCredentialState({ apiKey: '   ' })).toBe('empty');
  });
});
