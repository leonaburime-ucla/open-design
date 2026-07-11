// Feature-local hook for the Privacy settings section: the anonymous
// metrics/content telemetry toggles, the installation id display, and the
// consent/delete-my-data actions. All state lives on `cfg.telemetry` /
// `cfg.installationId` / `cfg.privacyDecisionAt` (injected via `cfg`/`setCfg`
// like the rest of the slice's sections) — no transport, so this hook needs
// no port/`useWiredX` wrapper.
import type { Dispatch, SetStateAction } from 'react';
import type { AppConfig, TelemetryConfig } from '../../../types';
import { generateInstallationId, nextTelemetryConfigPatch } from '../rules';

/** Inputs the Privacy section needs from its caller. */
export interface PrivacyInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

/** Everything the Privacy section JSX reads off the controller. */
export interface PrivacyController {
  telemetry: TelemetryConfig;
  installationId: string | null;
  hasMadeConsentDecision: boolean;
  patchTelemetry: (patch: Partial<TelemetryConfig>) => void;
  shareUsage: () => void;
  declineUsage: () => void;
  deleteMyData: () => void;
}

export function usePrivacy(input: PrivacyInput): PrivacyController {
  const { cfg, setCfg } = input;

  const patchTelemetry = (patch: Partial<TelemetryConfig>) => {
    setCfg((c) => ({ ...c, ...nextTelemetryConfigPatch(c, patch) }));
  };

  const shareUsage = () => {
    setCfg((c) => ({
      ...c,
      installationId: generateInstallationId(),
      privacyDecisionAt: Date.now(),
      telemetry: { metrics: true, content: true },
    }));
  };

  const declineUsage = () => {
    setCfg((c) => ({
      ...c,
      installationId: null,
      privacyDecisionAt: Date.now(),
      telemetry: { metrics: false, content: false },
    }));
  };

  const deleteMyData = () => {
    setCfg((c) => ({
      ...c,
      installationId: generateInstallationId(),
      privacyDecisionAt: c.privacyDecisionAt ?? Date.now(),
      telemetry: { metrics: false, content: false },
    }));
  };

  return {
    telemetry: cfg.telemetry ?? {},
    installationId: cfg.installationId ?? null,
    // `privacyDecisionAt` gates the consent surface. `installationId` is only
    // the anonymous reporting id and can be rotated by Delete my data
    // without making the first-run banner appear again.
    hasMadeConsentDecision: cfg.privacyDecisionAt != null,
    patchTelemetry,
    shareUsage,
    declineUsage,
    deleteMyData,
  };
}
