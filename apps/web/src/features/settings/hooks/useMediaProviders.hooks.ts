// Feature-local hook for the media-providers settings section: the
// available/coming-soon catalogue split, per-row API-key visibility toggles,
// and the reload flow. `onReloadMediaProviders` is an injected caller
// callback (like `ConnectorSection`'s `onPersistComposioKey`) rather than a
// port method — this section owns no transport of its own, only the
// reload-notice auto-dismiss timer, which IS injected as `MediaProvidersPort`
// so the hook stays DOM-free.
import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useT } from '../../../i18n';
import { isStoredMediaProviderEntryEmpty, mergeDaemonMediaProviders } from '../../../state/config';
import { MEDIA_PROVIDERS } from '../../../media/models';
import type { MediaProvider } from '../../../media/models';
import type { AppConfig } from '../../../types';
import type { MediaProvidersPort } from '../ports';
import { mediaProvidersPort } from '../dependencies';
import type { MediaProvidersReloadNotice } from '../types';
import { sortAvailableMediaProviders, sortComingSoonMediaProviders } from '../rules';

type Translate = ReturnType<typeof useT>;

/** A single-row credential patch — mirrors `AppConfig['mediaProviders'][id]`'s writable fields. */
export interface MediaProviderUpdatePatch {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  apiKeyConfigured?: boolean;
  apiKeyTail?: string;
}

/** Inputs the media-providers section needs from its caller. */
export interface MediaProvidersInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  onReloadMediaProviders?: () => Promise<AppConfig['mediaProviders'] | null>;
  /** Provider ids with an unsaved local edit — preserved across a reload merge. */
  pendingLocalProviderIds: ReadonlySet<string>;
  /** Called on every row edit so the caller can track "dirty" provider ids. */
  onChange: (providerId: string) => void;
  t: Translate;
}

/** Everything the media-providers section JSX reads off the controller. */
export interface MediaProvidersController {
  availableProviders: MediaProvider[];
  comingSoonProviders: MediaProvider[];
  reloadRunning: boolean;
  reloadNotice: MediaProvidersReloadNotice | null;
  visibleApiKeys: ReadonlySet<string>;
  updateProvider: (provider: MediaProvider, patch: MediaProviderUpdatePatch) => void;
  handleReload: () => void;
  toggleApiKeyVisibility: (providerId: string) => void;
}

export function useMediaProviders(
  port: MediaProvidersPort,
  input: MediaProvidersInput,
): MediaProvidersController {
  const { cfg, setCfg, onReloadMediaProviders, pendingLocalProviderIds, onChange, t } = input;

  const [reloadRunning, setReloadRunning] = useState(false);
  const [reloadNotice, setReloadNotice] = useState<MediaProvidersReloadNotice | null>(null);
  const [visibleApiKeys, setVisibleApiKeys] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    setVisibleApiKeys((current) => {
      const next = new Set<string>();
      for (const providerId of current) {
        const apiKey = cfg.mediaProviders?.[providerId]?.apiKey ?? '';
        if (apiKey.trim()) next.add(providerId);
      }
      return next.size === current.size ? current : next;
    });
  }, [cfg.mediaProviders]);

  const visibleProviders = MEDIA_PROVIDERS.filter((p) => p.settingsVisible !== false);
  const availableProviders = sortAvailableMediaProviders(visibleProviders, cfg.mediaProviders);
  const comingSoonProviders = sortComingSoonMediaProviders(visibleProviders);

  const updateProvider = (provider: MediaProvider, patch: MediaProviderUpdatePatch) => {
    onChange(provider.id);
    setCfg((curr) => {
      const prev = curr.mediaProviders?.[provider.id] ?? { apiKey: '', baseUrl: '', model: '' };
      const next = { ...prev, ...patch };
      const map = { ...(curr.mediaProviders ?? {}) };
      if (isStoredMediaProviderEntryEmpty(next)) {
        delete map[provider.id];
      } else {
        map[provider.id] = next;
      }
      return { ...curr, mediaProviders: map };
    });
  };

  const handleReload = async () => {
    if (!onReloadMediaProviders || reloadRunning) return;
    setReloadRunning(true);
    setReloadNotice(null);
    try {
      const next = await onReloadMediaProviders();
      if (!next) {
        setReloadNotice({ kind: 'error', message: t('settings.mediaProviderReloadError') });
        return;
      }
      setCfg((curr) => mergeDaemonMediaProviders(curr, next, {
        preserveLocalProviderIds: pendingLocalProviderIds,
      }));
      setReloadNotice({ kind: 'success', message: t('settings.mediaProviderReloadSuccess') });
    } finally {
      setReloadRunning(false);
    }
  };

  // Successful reload acknowledgement lives on the button (checkmark flash)
  // for ~2s then disappears; errors stay sticky since they need attention.
  useEffect(() => {
    if (reloadNotice?.kind !== 'success') return;
    return port.scheduleReloadNoticeTimeout(() => setReloadNotice(null), 2000);
  }, [reloadNotice, port]);

  const toggleApiKeyVisibility = (providerId: string) => {
    setVisibleApiKeys((current) => {
      const next = new Set(current);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  return {
    availableProviders,
    comingSoonProviders,
    reloadRunning,
    reloadNotice,
    visibleApiKeys,
    updateProvider,
    handleReload: () => void handleReload(),
    toggleApiKeyVisibility,
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via the component prop in
 * tests.
 */
export function useWiredMediaProviders(input: MediaProvidersInput): MediaProvidersController {
  return useMediaProviders(mediaProvidersPort, input);
}
