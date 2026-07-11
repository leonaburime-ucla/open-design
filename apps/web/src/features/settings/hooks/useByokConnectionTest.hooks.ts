// Feature-local hook for the BYOK execution-mode form's connection-test
// cluster. Owns the "Test connection" state machine (idle/running/done),
// its abort/revision/first-reset bookkeeping refs, the last-unsuccessful-key
// guard, and the auto-test debounce that re-runs the test silently after the
// user stops editing the API key/base URL/model/api-version fields. Reaches
// transport only through the injected `ByokConnectionTestPort`; the derived
// draft-validation/first-party-base-url values and the field-focus/notice
// callbacks come from the field-focus cluster (`useByokFieldFocus`) and the
// still-inline derived-config cluster, taken as params per ADR 0002's "hook
// takes other clusters' outputs as params" composition pattern.
import { useEffect, useRef, useState } from 'react';
import { byokProtocolToTracking } from '@open-design/contracts/analytics';
import type { ApiProtocol, AppConfig, ConnectionTestResponse } from '../../../types';
import { useT } from '../../../i18n';
import { useAnalytics } from '../../../analytics/provider';
import { trackSettingsByokTestResult } from '../../../analytics/events';
import {
  blockingByokDraftIssues,
  cleanByokApiKey,
  type ByokDraftValidation,
} from '../../../components/byok/validation';
import type { ByokConnectionTestPort } from '../ports';
import { byokConnectionTestPort } from '../dependencies';
import {
  byokErrorKindFromIssues,
  byokFieldMissingFromIssues,
  byokTrackingTestResult,
  providerConnectionTestKey,
} from '../rules';
import type {
  ByokFirstPartyBaseUrlHint,
  ByokPreconditionAction,
  ByokPreconditionNotice,
  ByokRequiredField,
  TestState,
} from '../types';

type Translate = ReturnType<typeof useT>;
type Track = ReturnType<typeof useAnalytics>['track'];

/** Inputs the BYOK connection-test cluster needs from its caller: the other
 *  BYOK clusters' outputs (field-focus/notice callbacks, the derived draft
 *  validation and first-party-base-url hint) plus the primitives every
 *  execution-mode cluster reads. */
export interface ByokConnectionTestInput {
  apiProtocol: ApiProtocol;
  cfg: AppConfig;
  t: Translate;
  track: Track;
  byokDraftValidation: ByokDraftValidation;
  byokFirstPartyBaseUrl: ByokFirstPartyBaseUrlHint | undefined;
  /** Skip the debounced auto-test entirely while the app is in visual
   *  stability mode (screenshot/e2e capture) — mirrors the sibling
   *  model-discovery debounce's own guard. */
  visualStabilityMode: boolean;
  focusByokRequiredField: (field: ByokRequiredField | undefined) => void;
  setByokPreconditionNotice: (notice: ByokPreconditionNotice | null) => void;
  showByokDraftValidationNotice: (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => void;
}

/** Everything the BYOK execution-mode form's connection-test control reads
 *  off this hook's controller. */
export interface ByokConnectionTestController {
  providerTestState: TestState;
  handleTestProvider: (options?: { silentPreconditions?: boolean }) => Promise<void>;
  handleAutoTestProvider: () => void;
}

export function useByokConnectionTest(
  port: ByokConnectionTestPort,
  input: ByokConnectionTestInput,
): ByokConnectionTestController {
  const {
    apiProtocol,
    cfg,
    t,
    track,
    byokDraftValidation,
    byokFirstPartyBaseUrl,
    visualStabilityMode,
    focusByokRequiredField,
    setByokPreconditionNotice,
    showByokDraftValidationNotice,
  } = input;

  const [providerTestState, setProviderTestState] = useState<TestState>({
    status: 'idle',
  });

  const providerTestAbortRef = useRef<AbortController | null>(null);
  const providerTestRevisionRef = useRef(0);
  const providerTestFirstResetRef = useRef(true);
  const providerAutoTestKeyRef = useRef<string | null>(null);
  const byokLastUnsuccessfulTestKeyRef = useRef<string | null>(null);

  // Any BYOK field the test itself depends on changed — drop a stale
  // running/done result and let the auto-test debounce below decide whether
  // to re-run silently. Skipped on the very first render so mount doesn't
  // clobber a state the caller may have seeded.
  useEffect(() => {
    if (providerTestFirstResetRef.current) {
      providerTestFirstResetRef.current = false;
      return;
    }
    providerTestRevisionRef.current += 1;
    providerAutoTestKeyRef.current = null;
    setByokPreconditionNotice(null);
    setProviderTestState((state) =>
      state.status === 'running' ? state : { status: 'idle' },
    );
  }, [
    cfg.apiProtocol,
    cfg.apiKey,
    cfg.baseUrl,
    cfg.model,
    cfg.apiVersion,
  ]);

  // Releasing the abort controller on unmount avoids the "setState after
  // unmount" warning if the dialog closes while a test is still running.
  useEffect(() => {
    return () => {
      providerTestAbortRef.current?.abort();
    };
  }, []);

  const handleTestProvider = async (
    options: { silentPreconditions?: boolean } = {},
  ): Promise<void> => {
    if (providerTestState.status === 'running') {
      return;
    }
    const blockingIssues = blockingByokDraftIssues(byokDraftValidation);
    const hasFirstPartyHostTypo = Boolean(byokFirstPartyBaseUrl?.hostTypo);
    const currentConfigKey = providerConnectionTestKey(apiProtocol, cfg);
    const lastUnsuccessfulConfigKey = byokLastUnsuccessfulTestKeyRef.current;
    const configKeyChanged = lastUnsuccessfulConfigKey !== null &&
      lastUnsuccessfulConfigKey !== currentConfigKey;
    if (hasFirstPartyHostTypo) {
      if (!options.silentPreconditions) {
        setByokPreconditionNotice({
          action: 'test',
          field: 'base_url',
          message: t('settings.testInvalidBaseUrl'),
        });
        focusByokRequiredField('base_url');
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    if (blockingIssues.length > 0) {
      if (options.silentPreconditions) {
        return;
      }
      showByokDraftValidationNotice('test', byokDraftValidation);
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: byokErrorKindFromIssues(blockingIssues),
          error_kind: byokErrorKindFromIssues(blockingIssues),
          field_missing: byokFieldMissingFromIssues(blockingIssues),
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: 0,
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
      return;
    }
    const controller = new AbortController();
    const revision = providerTestRevisionRef.current;
    providerTestAbortRef.current = controller;
    setProviderTestState({ status: 'running' });
    const startedAt = performance.now();
    const clearIfStale = () => {
      if (providerTestAbortRef.current === controller) {
        setProviderTestState({ status: 'idle' });
      }
    };
    try {
      const result: ConnectionTestResponse = await port.testProvider(
        {
          protocol: apiProtocol,
          baseUrl: cfg.baseUrl,
          apiKey: cleanByokApiKey(cfg.apiKey),
          model: cfg.model,
          apiVersion:
            apiProtocol === 'azure'
              ? cfg.apiVersion?.trim() || undefined
              : undefined,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({ status: 'done', result });
      if (!result.ok && result.kind === 'not_found_model') {
        focusByokRequiredField('model');
      }
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: byokTrackingTestResult(result),
          ...(result.ok ? {} : { error_code: result.kind || 'UNKNOWN' }),
          ...(result.ok ? {} : { error_kind: result.kind || 'UNKNOWN' }),
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: result.ok && configKeyChanged,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = result.ok ? null : currentConfigKey;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (providerTestRevisionRef.current !== revision) {
        clearIfStale();
        return;
      }
      setProviderTestState({
        status: 'done',
        result: {
          ok: false,
          kind: 'unknown',
          latencyMs: 0,
          model: cfg.model,
          detail: err instanceof Error ? err.message : 'Test request failed',
        },
      });
      const byokProviderId = byokProtocolToTracking(apiProtocol);
      if (byokProviderId) {
        trackSettingsByokTestResult(track, {
          page_name: 'settings',
          area: 'execution_model',
          provider_id: byokProviderId,
          result: 'failed',
          error_code: err instanceof Error ? err.name : 'UNKNOWN',
          error_kind: err instanceof Error ? err.name : 'UNKNOWN',
          field_missing: 'none',
          config_key_changed: configKeyChanged,
          success_after_action: false,
          duration_ms: Math.round(performance.now() - startedAt),
        });
      }
      byokLastUnsuccessfulTestKeyRef.current = currentConfigKey;
    } finally {
      if (providerTestAbortRef.current === controller) {
        providerTestAbortRef.current = null;
      }
    }
  };

  const handleAutoTestProvider = (): void => {
    if (providerTestState.status === 'running') {
      return;
    }
    if (byokFirstPartyBaseUrl?.hostTypo) {
      return;
    }
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) {
      return;
    }
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) {
      return;
    }
    providerAutoTestKeyRef.current = key;
    void handleTestProvider({ silentPreconditions: true });
  };

  // Debounced auto-test: once the user stops editing for 500ms with a
  // complete, valid draft, silently run the connection test so a working key
  // shows "ready" without an explicit click.
  useEffect(() => {
    if (cfg.mode !== 'api') return;
    if (visualStabilityMode) return;
    if (providerTestState.status === 'running') return;
    if (byokFirstPartyBaseUrl?.hostTypo) return;
    if (blockingByokDraftIssues(byokDraftValidation).length > 0) return;
    const key = providerConnectionTestKey(apiProtocol, cfg);
    if (providerAutoTestKeyRef.current === key) return;
    return port.scheduleAutoTestTimeout(() => {
      handleAutoTestProvider();
    }, 500);
  }, [
    apiProtocol,
    byokFirstPartyBaseUrl?.hostTypo,
    byokDraftValidation,
    cfg.apiKey,
    cfg.apiVersion,
    cfg.baseUrl,
    cfg.mode,
    cfg.model,
    port,
    providerTestState.status,
    visualStabilityMode,
  ]);

  return {
    providerTestState,
    handleTestProvider,
    handleAutoTestProvider,
  };
}

/**
 * Wirer: binds the real provider connection-test port and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via a port param in tests.
 */
export function useWiredByokConnectionTest(
  input: ByokConnectionTestInput,
): ByokConnectionTestController {
  return useByokConnectionTest(byokConnectionTestPort, input);
}
