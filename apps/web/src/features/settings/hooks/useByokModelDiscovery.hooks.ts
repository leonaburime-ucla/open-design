// Feature-local hook for the BYOK execution-mode form's model-discovery
// cluster. Owns the account-model-list fetch state machine (idle/running/
// done), its abort/revision/first-reset bookkeeping refs, the deferred
// commit-after-key-clean handoff, and the debounced auto-fetch that re-runs
// the fetch silently once the committed key/base-URL settle. Reaches
// transport only through the injected `ByokModelDiscoveryPort`; the derived
// draft-validation/first-party-base-url/cache-key values and the field-
// focus/notice callbacks come from the field-focus cluster
// (`useByokFieldFocus`) and the still-inline derived-config cluster, taken
// as params per ADR 0002's "hook takes other clusters' outputs as params"
// composition pattern. `providerModelsState`/`providerModelsCommittedKey`
// and their setters are exposed on the controller (not just read) because
// the still-inline BYOK-provider-switch handler (`setByokProvider`) snapshots
// and restores them as part of its per-provider form draft — mirroring how
// `ByokProviderFormDraft` already carries this cluster's state across a
// provider switch.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { byokProtocolToTracking } from '@open-design/contracts/analytics';
import type { ApiProtocol, ApiProtocolConfig, AppConfig } from '../../../types';
import { useT } from '../../../i18n';
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsByokModelsFetchResult } from '../../../analytics/events';
import {
  blockingByokDraftIssues,
  cleanByokApiKey,
  type ByokDraftValidation,
} from '../../../components/byok/validation';
import type { ByokModelDiscoveryPort } from '../ports';
import { byokModelDiscoveryPort } from '../dependencies';
import {
  byokErrorKindFromIssues,
  byokFieldMissingFromIssues,
  isProviderModelDiscoveryUnsupported,
  isValidApiBaseUrl,
  missingByokModelFetchFields,
  providerModelsCacheKey,
} from '../rules';
import type {
  ByokFirstPartyBaseUrlHint,
  ByokPreconditionAction,
  ByokPreconditionNotice,
  ByokRequiredField,
  ProviderModelsCache,
  ProviderModelsState,
} from '../types';

type Translate = ReturnType<typeof useT>;
type Track = ReturnType<typeof useAnalytics>['track'];

/** Inputs the BYOK model-discovery cluster needs from its caller: the other
 *  BYOK clusters' outputs (field-focus/notice callbacks, the connection-test
 *  cluster's `handleAutoTestProvider`, the derived model-fetch draft
 *  validation, first-party-base-url hint, and cache key) plus the primitives
 *  every execution-mode cluster reads. */
export interface ByokModelDiscoveryInput {
  apiProtocol: ApiProtocol;
  cfg: AppConfig;
  /** The dialog's original `initial` prop — seeds `providerModelsCommittedKey`
   *  so a config that was already valid when the dialog opened doesn't need
   *  an extra blur/edit before the debounced auto-fetch effect fires. */
  initial: AppConfig;
  t: Translate;
  track: Track;
  byokModelFetchDraftValidation: ByokDraftValidation;
  byokFirstPartyBaseUrl: ByokFirstPartyBaseUrlHint | undefined;
  /** The current provider-models cache key (protocol + base URL + hashed
   *  key/api-version) — computed by the still-inline derived-config
   *  cluster. */
  providerModelsKey: string;
  providerModelsCache: ProviderModelsCache;
  setProviderModelsCache: Dispatch<SetStateAction<ProviderModelsCache>>;
  /** Skip the debounced auto-fetch entirely while the app is in visual
   *  stability mode (screenshot/e2e capture) — mirrors the sibling
   *  connection-test debounce's own guard. */
  visualStabilityMode: boolean;
  focusByokRequiredField: (field: ByokRequiredField | undefined) => void;
  setByokPreconditionNotice: (notice: ByokPreconditionNotice | null) => void;
  showByokDraftValidationNotice: (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => void;
  /** The connection-test cluster's silent auto-test trigger — the key-commit
   *  handler below re-tests the connection right after committing the model
   *  fetch inputs, same as before extraction. */
  handleAutoTestProvider: () => void;
  /** Patch the current protocol's `ApiProtocolConfig` slice of `cfg` — the
   *  key-commit handler uses this to write back a whitespace-cleaned API
   *  key. Owned by the orchestrator (shared by every BYOK field), not this
   *  cluster. */
  updateApiConfig: (patch: Partial<ApiProtocolConfig>) => void;
}

/** Everything the BYOK execution-mode form's model-discovery control reads
 *  off this hook's controller. */
export interface ByokModelDiscoveryController {
  providerModelsState: ProviderModelsState;
  setProviderModelsState: Dispatch<SetStateAction<ProviderModelsState>>;
  providerModelsCommittedKey: string | null;
  setProviderModelsCommittedKey: Dispatch<SetStateAction<string | null>>;
  /** Flag the next cfg-change reset effect tick as a same-render BYOK
   *  provider switch (already accounted for by `setByokProvider`'s own
   *  draft restore) so it does not also clobber the restored state. */
  skipNextProviderModelsReset: (skip: boolean) => void;
  handleFetchProviderModels: (
    options?: { silent?: boolean; trigger?: 'auto' | 'manual' },
  ) => Promise<void>;
  commitProviderModelsInputs: () => void;
  onByokKeyCommit: () => void;
}

export function useByokModelDiscovery(
  port: ByokModelDiscoveryPort,
  input: ByokModelDiscoveryInput,
): ByokModelDiscoveryController {
  const {
    apiProtocol,
    cfg,
    initial,
    t,
    track,
    byokModelFetchDraftValidation,
    byokFirstPartyBaseUrl,
    providerModelsKey,
    providerModelsCache,
    setProviderModelsCache,
    visualStabilityMode,
    focusByokRequiredField,
    setByokPreconditionNotice,
    showByokDraftValidationNotice,
    handleAutoTestProvider,
    updateApiConfig,
  } = input;

  const [providerModelsState, setProviderModelsState] =
    useState<ProviderModelsState>({ status: 'idle' });
  const [providerModelsCommittedKey, setProviderModelsCommittedKey] =
    useState<string | null>(() => {
      const protocol = initial.apiProtocol ?? 'anthropic';
      if (
        initial.mode !== 'api' ||
        protocol === 'azure' ||
        protocol === 'ollama' ||
        missingByokModelFetchFields(initial, protocol).length > 0 ||
        !isValidApiBaseUrl(initial.baseUrl)
      ) {
        return null;
      }
      return providerModelsCacheKey(
        protocol,
        initial.baseUrl,
        initial.apiKey,
        initial.apiVersion ?? '',
      );
    });

  const providerModelsAbortRef = useRef<AbortController | null>(null);
  const providerModelsRevisionRef = useRef(0);
  const providerModelsFirstResetRef = useRef(true);
  const providerModelsSkipNextResetRef = useRef(false);
  const deferAfterKeyCleanRef = useRef(false);

  const skipNextProviderModelsReset = (skip: boolean): void => {
    providerModelsSkipNextResetRef.current = skip;
  };

  // Any BYOK field the model fetch itself depends on changed — drop a stale
  // running/done result and the committed-key gate, so a later commit/auto-
  // fetch starts clean. Skipped on the very first render so mount doesn't
  // clobber a state the caller may have seeded, and skipped once when a
  // same-render BYOK provider switch already restored the saved draft's
  // state via `skipNextProviderModelsReset`.
  useEffect(() => {
    if (providerModelsFirstResetRef.current) {
      providerModelsFirstResetRef.current = false;
      return;
    }
    if (providerModelsSkipNextResetRef.current) {
      providerModelsSkipNextResetRef.current = false;
      return;
    }
    providerModelsRevisionRef.current += 1;
    providerModelsAbortRef.current?.abort();
    providerModelsAbortRef.current = null;
    setProviderModelsCommittedKey(null);
    setByokPreconditionNotice(null);
    setProviderModelsState({ status: 'idle' });
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.apiVersion,
  ]);

  // Releasing the abort controller on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a model-fetch is still
  // running. The connection-test cluster's own abort controller is released
  // by an equivalent unmount effect inside `useByokConnectionTest`.
  useEffect(() => {
    return () => {
      providerModelsAbortRef.current?.abort();
    };
  }, []);

  const handleFetchProviderModels = async (
    options: { silent?: boolean; trigger?: 'auto' | 'manual' } = {},
  ): Promise<void> => {
    const trigger = options.trigger ?? (options.silent ? 'auto' : 'manual');
    const byokProviderId = byokProtocolToTracking(apiProtocol);
    const trackModelsFetchResult = (
      props: Omit<
        Parameters<typeof trackSettingsByokModelsFetchResult>[1],
        'page_name' | 'area' | 'provider_id' | 'trigger' | 'source'
      >,
      source: 'network' | 'cache' = 'network',
    ) => {
      if (!byokProviderId) return;
      trackSettingsByokModelsFetchResult(track, {
        page_name: 'settings',
        area: 'configure_execution_mode_byok',
        provider_id: byokProviderId,
        trigger,
        source,
        ...props,
      });
    };
    if (providerModelsState.status === 'running') {
      return;
    }
    if (apiProtocol === 'azure') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_azure',
        error_kind: 'unsupported_azure',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedAzure'),
        });
      }
      return;
    }
    if (apiProtocol === 'ollama') {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_ollama',
        error_kind: 'unsupported_ollama',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupportedOllama'),
        });
      }
      return;
    }
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: 'unsupported_provider_models',
        error_kind: 'unsupported_provider_models',
        duration_ms: 0,
      });
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          message: t('settings.fetchModelsUnsupported'),
        });
      }
      return;
    }
    const modelFetchBlockingIssues = blockingByokDraftIssues(
      byokModelFetchDraftValidation,
    );
    if (byokFirstPartyBaseUrl?.hostTypo) {
      if (!options.silent) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      return;
    }
    if (modelFetchBlockingIssues.length > 0) {
      trackModelsFetchResult({
        result: 'failed',
        error_code: byokErrorKindFromIssues(modelFetchBlockingIssues),
        error_kind: byokErrorKindFromIssues(modelFetchBlockingIssues),
        field_missing: byokFieldMissingFromIssues(modelFetchBlockingIssues),
        duration_ms: 0,
      });
      if (!options.silent) {
        showByokDraftValidationNotice('test', byokModelFetchDraftValidation);
      }
      return;
    }
    const cacheKey = providerModelsKey;
    const cachedModels = providerModelsCache[cacheKey];
    if (cachedModels) {
      trackModelsFetchResult(
        {
          result: 'success',
          model_count: cachedModels.length,
          duration_ms: 0,
        },
        'cache',
      );
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: true,
          kind: 'success',
          latencyMs: 0,
          models: cachedModels,
        },
      });
      return;
    }
    const controller = new AbortController();
    const revision = providerModelsRevisionRef.current;
    providerModelsAbortRef.current = controller;
    setProviderModelsState({ status: 'running', cacheKey });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerModelsAbortRef.current === controller) {
        setProviderModelsState({ status: 'idle' });
      }
    };
    try {
      const result = await port.fetchModels(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      if (result.ok && result.models?.length) {
        setProviderModelsCache((prev) => ({
          ...prev,
          [cacheKey]: result.models ?? [],
        }));
      }
      trackModelsFetchResult({
        result: result.ok ? 'success' : 'failed',
        ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
        ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
        model_count: result.ok ? result.models?.length ?? 0 : 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
      setProviderModelsState({ status: 'done', cacheKey, result });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerModelsRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderModelsState({
        status: 'done',
        cacheKey,
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          detail: err instanceof Error ? err.message : 'Model list request failed',
        },
      });
      trackModelsFetchResult({
        result: 'failed',
        error_code: err instanceof Error ? err.name : 'UNKNOWN',
        error_kind: err instanceof Error ? err.name : 'UNKNOWN',
        model_count: 0,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      if (providerModelsAbortRef.current === controller) {
        providerModelsAbortRef.current = null;
      }
    }
  };

  const commitProviderModelsInputs = (): void => {
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
      return;
    }
    setProviderModelsCommittedKey(providerModelsKey);
  };

  const onByokKeyCommit = (): void => {
    // Normalize the stored key on blur so the value that flows into the
    // connection-test / model-fetch requests below (and back to the daemon
    // via autosave) is already free of pasted whitespace / zero-width
    // characters — otherwise a key like "sk-ant-...\n" would only raise a
    // non-blocking warning yet still go out malformed over the wire.
    const cleanedApiKey = cleanByokApiKey(cfg.apiKey);
    if (cleanedApiKey !== cfg.apiKey) {
      // Writing the cleaned key changes cfg.apiKey, which re-runs the reset
      // effects above: one nulls providerModelsCommittedKey, the other bumps
      // providerTestRevisionRef / clears providerAutoTestKeyRef. So committing
      // the model key or starting the auto-test here would be clobbered — the
      // model commit before the auto-fetch effect reads it, and the auto-test
      // result dropped by the stale-revision guard. Defer both until the
      // cleaned value has landed (effect below), otherwise account models
      // never auto-load and the auto-test success/error never reaches the UI
      // for the exact dirty-paste case this handles.
      deferAfterKeyCleanRef.current = true;
      updateApiConfig({ apiKey: cleanedApiKey });
      return;
    }
    commitProviderModelsInputs();
    handleAutoTestProvider();
  };

  useEffect(() => {
    if (!deferAfterKeyCleanRef.current) return;
    deferAfterKeyCleanRef.current = false;
    if (
      byokFirstPartyBaseUrl?.hostTypo ||
      blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0
    ) {
      setProviderModelsCommittedKey(null);
    } else {
      setProviderModelsCommittedKey(providerModelsKey);
    }
    // Runs after the provider-test reset effect (declaration order) bumped the
    // revision for the cleaned key, so this auto-test is not flagged stale.
    handleAutoTestProvider();
  }, [
    byokFirstPartyBaseUrl?.hostTypo,
    byokModelFetchDraftValidation,
    cfg.apiKey,
    providerModelsKey,
  ]);

  // Debounced auto-fetch: once the key/base-URL/api-version commit settles
  // (or immediately for AIHubMix, which needs no key), silently fetch the
  // account model list so a working key shows its models without an
  // explicit "Fetch models" click.
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (isProviderModelDiscoveryUnsupported(apiProtocol, cfg.baseUrl)) return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokModelFetchDraftValidation).length > 0) return;
    // AIHubMix needs no key and prefills its base URL, so there's nothing to
    // debounce-commit — fetch as soon as the tab is selected. Every other
    // protocol waits until the key/baseUrl inputs are committed (on blur) so we
    // don't fire on each keystroke.
    if (apiProtocol !== 'aihubmix' && providerModelsCommittedKey !== providerModelsKey) return;
    return port.scheduleAutoFetchTimeout(() => {
      void handleFetchProviderModels({ silent: true });
    }, 300);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.mode,
    cfg.apiVersion,
    byokModelFetchDraftValidation,
    port,
    providerModelsCommittedKey,
    providerModelsKey,
    visualStabilityMode,
  ]);

  return {
    providerModelsState,
    setProviderModelsState,
    providerModelsCommittedKey,
    setProviderModelsCommittedKey,
    skipNextProviderModelsReset,
    handleFetchProviderModels,
    commitProviderModelsInputs,
    onByokKeyCommit,
  };
}

/**
 * Wirer: binds the real provider model-discovery port and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via a port param in tests.
 */
export function useWiredByokModelDiscovery(
  input: ByokModelDiscoveryInput,
): ByokModelDiscoveryController {
  return useByokModelDiscovery(byokModelDiscoveryPort, input);
}
