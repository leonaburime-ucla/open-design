// Feature-local hook for the SettingsDialog's autosave loop. Every committed
// edit to `cfg` schedules a debounced sync to localStorage + the daemon (via
// the caller-injected `onPersist`) so rapid typing in text fields doesn't
// flood the daemon with PUTs while still feeling near-instant for toggles/
// selects. Also owns the media-provider force-sync retry loop and the
// unmount flush that keeps a fast-closing dialog from stranding an in-flight
// edit. Reaches the browser only through the injected `AutosavePort`'s timer
// bridge; `isAutosaveDraftOnlyChange` and `lastSavedAppearanceRef` are taken
// as params (owned by the orchestrator/`App.tsx`, not this cluster) per ADR
// 0002's "hook takes other clusters' outputs as params" composition pattern.
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { resolveAccentColor } from '../../../state/appearance';
import type { AppConfig, AppTheme } from '../../../types';
import type { AutosavePort } from '../ports';
import { autosavePort } from '../dependencies';
import type { AutosaveStatus } from '../types';

/** Inputs the autosave loop needs from its caller. */
export interface AutosaveInput {
  cfg: AppConfig;
  /** Persist the current draft. Should NOT close the dialog and should NOT
   *  mutate onboarding state — it represents an incremental save. */
  onPersist: (
    cfg: AppConfig,
    options?: { forceMediaProviderSync?: boolean },
  ) => Promise<void> | void;
  /** True when the only diffs between `next`/`last` are fields the app
   *  intentionally strips before disk/daemon writes (e.g. an unsaved
   *  Composio API key draft) — a save would be a no-op that mis-reports
   *  "Saved". Defined in `App.tsx` (shared with the broader persist flow),
   *  injected rather than imported so this slice stays app-root-free. */
  isAutosaveDraftOnlyChange: (next: AppConfig, last: AppConfig) => boolean;
  /** The live theme-preview revert baseline, owned by the appearance-revert
   *  effect right above this hook's call site in the orchestrator. A
   *  successful autosave updates it so closing Settings afterward does not
   *  roll the document back to stale colors. */
  lastSavedAppearanceRef: MutableRefObject<{ theme: AppTheme; accentColor: string }>;
  /** Clears the "optimistic edit" id set the Media Providers section reads
   *  once a forced media-provider sync actually lands. */
  setPendingMediaProviderEditIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
}

/** Everything the orchestrator reads/calls off this hook's controller. */
export interface AutosaveController {
  autosaveStatus: AutosaveStatus;
  /** Exposed so the `initial`-prop AMR-reconciliation effect (declared
   *  before this hook owns any state) can keep the autosave baseline's
   *  `agentCliEnv`/`agentModels` fields in sync — mirrors how the BYOK
   *  model-discovery cluster exposes its state setters for `setByokProvider`
   *  to write through directly. */
  autosaveLastSavedRef: MutableRefObject<AppConfig>;
  /** Record a Media Providers section edit: bumps the force-sync version and
   *  adds `providerId` to the pending-edit set for the section's optimistic
   *  UI. */
  recordMediaProviderEdit: (providerId: string) => void;
}

export function useAutosave(port: AutosavePort, input: AutosaveInput): AutosaveController {
  const {
    cfg,
    onPersist,
    isAutosaveDraftOnlyChange,
    lastSavedAppearanceRef,
    setPendingMediaProviderEditIds,
  } = input;

  const [autosaveStatus, setAutosaveStatus] = useState<AutosaveStatus>('idle');
  // Skip the very first effect tick so just opening the dialog doesn't
  // appear to "save" anything before the user has touched a field.
  const autosaveSkipFirstRef = useRef(true);
  const autosaveTimerCancelRef = useRef<(() => void) | null>(null);
  const autosaveSavedTimerCancelRef = useRef<(() => void) | null>(null);
  const autosaveRetryTimerCancelRef = useRef<(() => void) | null>(null);
  const autosavePendingFlushRef = useRef(false);
  const autosaveLatestRef = useRef<AppConfig>(cfg);
  // Baseline used by the draft-only detector: the snapshot at the most
  // recent successful autosave (or the initial cfg on mount).
  const autosaveLastSavedRef = useRef<AppConfig>(cfg);
  const mediaProvidersChangeVersionRef = useRef(0);
  const lastSyncedMediaProvidersVersionRef = useRef(0);
  const [autosaveRetryTick, setAutosaveRetryTick] = useState(0);
  autosaveLatestRef.current = cfg;

  const recordMediaProviderEdit = (providerId: string): void => {
    mediaProvidersChangeVersionRef.current += 1;
    setPendingMediaProviderEditIds((current) => {
      if (current.has(providerId)) return current;
      const next = new Set(current);
      next.add(providerId);
      return next;
    });
  };

  useEffect(() => {
    if (autosaveSkipFirstRef.current) {
      autosaveSkipFirstRef.current = false;
      autosaveLastSavedRef.current = cfg;
      return;
    }
    setAutosaveStatus('pending');
    if (autosaveSavedTimerCancelRef.current) {
      autosaveSavedTimerCancelRef.current();
      autosaveSavedTimerCancelRef.current = null;
    }
    if (autosaveRetryTimerCancelRef.current) {
      autosaveRetryTimerCancelRef.current();
      autosaveRetryTimerCancelRef.current = null;
    }
    if (autosaveTimerCancelRef.current) {
      autosaveTimerCancelRef.current();
    }
    autosavePendingFlushRef.current = true;
    autosaveTimerCancelRef.current = port.scheduleTimeout(() => {
      autosavePendingFlushRef.current = false;
      autosaveTimerCancelRef.current = null;
      const snapshot = autosaveLatestRef.current;
      const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
      const persistOptions = {
        forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
      };
      // Draft-only edit (e.g. the user is mid-typing the Composio API key,
      // which only commits via the explicit "Save key" gesture): skip the
      // persist and settle the indicator to idle. The forced media-provider
      // sync path still runs because that is a real outbound effect even
      // when the persisted shape hasn't changed.
      if (
        !persistOptions.forceMediaProviderSync
        && isAutosaveDraftOnlyChange(snapshot, autosaveLastSavedRef.current)
      ) {
        setAutosaveStatus('idle');
        return;
      }
      setAutosaveStatus('saving');
      void (async () => {
        try {
          await onPersist(snapshot, persistOptions);
          autosaveLastSavedRef.current = snapshot;
          lastSavedAppearanceRef.current = {
            theme: snapshot.theme ?? 'system',
            accentColor: resolveAccentColor(snapshot.accentColor),
          };
          // If a newer edit landed while the request was in flight, leave
          // the status as 'pending' so the next debounce tick owns the
          // indicator instead of flashing "Saved".
          if (autosaveLatestRef.current !== snapshot) {
            setAutosaveStatus('pending');
            return;
          }
          if (persistOptions.forceMediaProviderSync) {
            lastSyncedMediaProvidersVersionRef.current = mediaProvidersVersion;
            setPendingMediaProviderEditIds(new Set());
          }
          setAutosaveStatus('saved');
          autosaveSavedTimerCancelRef.current = port.scheduleTimeout(() => {
            autosaveSavedTimerCancelRef.current = null;
            // Settle to idle after a moment so the indicator doesn't stay on
            // "Saved" forever and become noise.
            setAutosaveStatus((curr) => (curr === 'saved' ? 'idle' : curr));
          }, 1800);
        } catch {
          if (
            persistOptions.forceMediaProviderSync
            && autosaveLatestRef.current === snapshot
            && mediaProvidersChangeVersionRef.current === mediaProvidersVersion
            && lastSyncedMediaProvidersVersionRef.current < mediaProvidersVersion
          ) {
            setAutosaveStatus('pending');
            autosaveRetryTimerCancelRef.current = port.scheduleTimeout(() => {
              autosaveRetryTimerCancelRef.current = null;
              if (
                autosaveLatestRef.current !== snapshot
                || mediaProvidersChangeVersionRef.current !== mediaProvidersVersion
                || lastSyncedMediaProvidersVersionRef.current >= mediaProvidersVersion
              ) {
                return;
              }
              setAutosaveRetryTick((tick) => tick + 1);
            }, 1500);
            return;
          }
          setAutosaveStatus('error');
        }
      })();
    }, 400);
    return () => {
      if (autosaveTimerCancelRef.current) {
        autosaveTimerCancelRef.current();
        autosaveTimerCancelRef.current = null;
      }
    };
  }, [cfg, onPersist, autosaveRetryTick]);

  // Flush any pending autosave on unmount so a fast-closing dialog never
  // strands an in-flight edit. We also cancel the "Saved" toast timer to
  // avoid setState after unmount.
  useEffect(() => {
    return () => {
      if (autosavePendingFlushRef.current) {
        const mediaProvidersVersion = mediaProvidersChangeVersionRef.current;
        // Best-effort flush; if it rejects, localStorage already has the
        // latest copy from the synchronous saveConfig call inside onPersist.
        autosavePendingFlushRef.current = false;
        void Promise.resolve(onPersist(autosaveLatestRef.current, {
          forceMediaProviderSync: mediaProvidersVersion > lastSyncedMediaProvidersVersionRef.current,
        })).catch(() => undefined);
      }
      if (autosaveSavedTimerCancelRef.current) {
        autosaveSavedTimerCancelRef.current();
        autosaveSavedTimerCancelRef.current = null;
      }
      if (autosaveRetryTimerCancelRef.current) {
        autosaveRetryTimerCancelRef.current();
        autosaveRetryTimerCancelRef.current = null;
      }
    };
  }, [onPersist]);

  return {
    autosaveStatus,
    autosaveLastSavedRef,
    recordMediaProviderEdit,
  };
}

/**
 * Wirer: binds the real autosave timer-bridge port and returns a
 * ready-to-call hook. This is the default the orchestrator injects; swap it
 * via a port param in tests.
 */
export function useWiredAutosave(input: AutosaveInput): AutosaveController {
  return useAutosave(autosavePort, input);
}
