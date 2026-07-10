// Feature-local hook for the Composio credential form inside the connectors
// section: the section-local save state machine (idle → saving → saved/error),
// the two-stage destructive "Clear" confirmation, and the timers that arm the
// final destructive button and auto-dismiss the saved pill.
//
// The Composio key bypasses the dialog's global autosave loop because it is a
// secret — persistence is an explicit user gesture, injected as the
// `onPersistComposioKey` callback (the transport seam lives with the caller, so
// this hook holds no `fetch` and stays DOM-free apart from a focus ref and bare
// timers). Extracting it here lets the ConnectorSection component render off a
// controller instead of owning ~180 lines of interlocked state (ADR 0002).
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { AppConfig } from '../../../types';
import { deriveComposioCredentialState } from '../rules';

/** Inputs the connectors credential form needs from its caller. */
export interface ComposioKeyFormInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  /** True while the daemon-backed Composio config is still hydrating. */
  composioConfigLoading: boolean;
  /** Persist the freshly typed Composio API key to the daemon. */
  onPersistComposioKey: (composio: AppConfig['composio']) => Promise<void> | void;
}

/** Everything the ConnectorSection JSX reads off the credential form. */
export interface ComposioKeyFormController {
  /** The current draft value bound to the password input. */
  apiKey: string;
  /** True when a key is saved (with or without a fresh draft over it). */
  hasSavedKey: boolean;
  /** True when the user has typed an unsaved replacement/new key. */
  hasPendingEdit: boolean;
  /** True when any key (saved or pending) exists — gates Clear. */
  apiKeyConfigured: boolean;
  /** True when a key is saved on the daemon side (drives the catalog gate). */
  savedApiKeyConfigured: boolean;
  /** The last-4 tail of the saved key for the status badge, if any. */
  tail: string | undefined;
  keySaveStatus: 'idle' | 'saving' | 'saved' | 'error';
  catalogRefreshNonce: number;
  clearStage: 'idle' | 'confirm' | 'final';
  clearArmed: boolean;
  saveDisabled: boolean;
  clearDisabled: boolean;
  /** Ref for the final destructive confirm button (focused when it arms). */
  finalConfirmButtonRef: RefObject<HTMLButtonElement>;
  /** Patch the stored Composio config in place. */
  updateComposio: (patch: NonNullable<AppConfig['composio']>) => void;
  handleSaveKey: () => Promise<void>;
  handleClearRequest: () => void;
  handleClearAbort: () => void;
  handleClearContinue: () => void;
  handleClearCommit: () => Promise<void>;
}

export function useComposioKeyForm({
  cfg,
  setCfg,
  composioConfigLoading,
  onPersistComposioKey,
}: ComposioKeyFormInput): ComposioKeyFormController {
  const composio = cfg.composio ?? {};

  const updateComposio = useCallback(
    (patch: NonNullable<AppConfig['composio']>) => {
      setCfg((curr) => ({ ...curr, composio: { ...(curr.composio ?? {}), ...patch } }));
    },
    [setCfg],
  );
  const credentialState = deriveComposioCredentialState(composio);
  const hasSavedKey = credentialState === 'saved' || credentialState === 'saved-pending';
  const hasPendingEdit = credentialState === 'pending-new' || credentialState === 'saved-pending';
  const apiKeyConfigured = credentialState !== 'empty';
  const savedApiKeyConfigured = Boolean(composio.apiKeyConfigured || hasSavedKey);
  const tail = composio.apiKeyTail?.trim();

  // Section-local save state. The Composio key bypasses the dialog's
  // global autosave loop because it is a secret — we don't want
  // partial-typed keys leaving the browser on every keystroke. The
  // user explicitly clicks "Save key" when they're ready, the request
  // completes, the daemon returns a tail-only echo, and we land in
  // the saved state with the same UI as a key loaded from disk.
  const [keySaveStatus, setKeySaveStatus] =
    useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [catalogRefreshNonce, setCatalogRefreshNonce] = useState(0);
  const keySavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Clear the saved-state timer on unmount to avoid setState after unmount
  useEffect(() => {
    return () => {
      if (keySavedTimerRef.current != null) {
        clearTimeout(keySavedTimerRef.current);
      }
    };
  }, []);
  const handleSaveKey = useCallback(async () => {
    if (keySaveStatus === 'saving') return;
    if (!hasPendingEdit) return;
    if (composioConfigLoading) return;
    // Clear any stale timer before transitioning to 'saving' to prevent
    // it from firing during the await and flipping the button back to idle.
    if (keySavedTimerRef.current != null) {
      clearTimeout(keySavedTimerRef.current);
      keySavedTimerRef.current = null;
    }
    const pendingKey = composio.apiKey ?? '';
    setKeySaveStatus('saving');
    try {
      await onPersistComposioKey(cfg.composio);
      // Mirror the parent's normalization so the local draft moves
      // into the saved state immediately: drop the secret from the
      // input, mark configured, and store the last-4 tail for the
      // status badge. The parent's setConfig won't propagate back to
      // the dialog because `initial` is read once at mount.
      updateComposio({
        apiKey: '',
        apiKeyConfigured: true,
        apiKeyTail: pendingKey.trim().slice(-4),
      });
      setCatalogRefreshNonce((nonce) => nonce + 1);
      // Clear any existing timer before starting a new one to avoid
      // a stale timeout flipping status back to 'idle' after a
      // subsequent save or clear.
      if (keySavedTimerRef.current != null) {
        clearTimeout(keySavedTimerRef.current);
      }
      setKeySaveStatus('saved');
      keySavedTimerRef.current = setTimeout(() => {
        setKeySaveStatus('idle');
      }, 2000);
    } catch {
      if (keySavedTimerRef.current != null) {
        clearTimeout(keySavedTimerRef.current);
      }
      setKeySaveStatus('error');
      keySavedTimerRef.current = null;
    }
  }, [
    cfg.composio,
    composio.apiKey,
    composioConfigLoading,
    hasPendingEdit,
    keySaveStatus,
    onPersistComposioKey,
    updateComposio,
  ]);

  // Action gating during hydration. Both Save and Clear are dangerous
  // before the daemon's response lands: Save would push whatever the
  // user typed (or didn't type) over the saved key, and Clear would
  // unconditionally wipe it. The skeleton state below makes this
  // visually obvious; the disabled flags here are the safety net.
  const actionsLocked = composioConfigLoading || keySaveStatus === 'saving';
  const saveDisabled = actionsLocked || !hasPendingEdit;
  const clearDisabled = actionsLocked || !apiKeyConfigured;

  // Two-stage destructive confirmation for "Clear". Clearing the saved
  // Composio API key cascades into disconnecting every connector that
  // depends on it, which is irreversible from the UI's standpoint —
  // accounts, OAuth grants, and tool access all unwind. To stop that
  // from happening on a stray click we gate the existing wipe behind
  //   1. an inline warning panel (must click "Continue"), then
  //   2. a final destructive confirmation panel with a brief arming
  //      window so the destructive button cannot be hit by reflex
  //      double-click, then
  //   3. the original clear behavior fires.
  // The panel collapses on Cancel, when the saved key disappears for
  // any other reason, or when the user navigates away from the section.
  const [clearStage, setClearStage] = useState<'idle' | 'confirm' | 'final'>('idle');
  const [clearArmed, setClearArmed] = useState(false);
  const finalConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  // Reset the flow if the underlying state stops being clearable
  // (e.g. the daemon reloaded and there's nothing saved anymore, or
  // hydration started). This avoids a stale confirmation panel sitting
  // open over a key that no longer exists.
  useEffect(() => {
    if (!apiKeyConfigured || composioConfigLoading) {
      setClearStage('idle');
      setClearArmed(false);
    }
  }, [apiKeyConfigured, composioConfigLoading]);
  // Arm the destructive button after a short delay once the user
  // reaches the final stage. Until then the button is visually hot
  // but inert — this is the "hold on a sec" moment that keeps a
  // reflex Enter / double-click from blowing through both stages.
  useEffect(() => {
    if (clearStage !== 'final') {
      setClearArmed(false);
      return;
    }
    setClearArmed(false);
    const timer = setTimeout(() => setClearArmed(true), 700);
    // Pull focus to the final confirm button so keyboard users can
    // see the arming animation finish and choose deliberately rather
    // than tabbing through stale focus state.
    const focusTimer = setTimeout(() => {
      finalConfirmButtonRef.current?.focus({ preventScroll: true });
    }, 720);
    return () => {
      clearTimeout(timer);
      clearTimeout(focusTimer);
    };
  }, [clearStage]);
  const handleClearRequest = useCallback(() => {
    if (clearDisabled) return;
    setClearStage('confirm');
  }, [clearDisabled]);
  const handleClearAbort = useCallback(() => {
    setClearStage('idle');
    setClearArmed(false);
  }, []);
  const handleClearContinue = useCallback(() => {
    setClearStage('final');
  }, []);
  const handleClearCommit = useCallback(async () => {
    if (keySaveStatus === 'saving') return;
    if (!clearArmed) return;
    // Clear any stale timer before transitioning to 'saving', matching
    // handleSaveKey's pattern for consistency.
    if (keySavedTimerRef.current != null) {
      clearTimeout(keySavedTimerRef.current);
      keySavedTimerRef.current = null;
    }
    setKeySaveStatus('saving');
    try {
      const cleared = {
        apiKey: '',
        apiKeyConfigured: false,
        apiKeyTail: '',
      };
      await onPersistComposioKey(cleared);
      updateComposio(cleared);
      setCatalogRefreshNonce((nonce) => nonce + 1);
      setClearStage('idle');
      setClearArmed(false);
      setKeySaveStatus('idle');
    } catch {
      if (keySavedTimerRef.current != null) {
        clearTimeout(keySavedTimerRef.current);
      }
      setKeySaveStatus('error');
      keySavedTimerRef.current = null;
    }
  }, [clearArmed, keySaveStatus, onPersistComposioKey, updateComposio]);

  return {
    apiKey: composio.apiKey ?? '',
    hasSavedKey,
    hasPendingEdit,
    apiKeyConfigured,
    savedApiKeyConfigured,
    tail,
    keySaveStatus,
    catalogRefreshNonce,
    clearStage,
    clearArmed,
    saveDisabled,
    clearDisabled,
    finalConfirmButtonRef,
    updateComposio,
    handleSaveKey,
    handleClearRequest,
    handleClearAbort,
    handleClearContinue,
    handleClearCommit,
  };
}
