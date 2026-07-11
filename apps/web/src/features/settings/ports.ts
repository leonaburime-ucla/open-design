// Ports the settings slice depends on. Each interface is the boundary a
// cluster's hook is injected with; `dependencies.ts` (the only feature file
// allowed to import `providers/`) binds the real transport to it (ADR 0002).
import type { ConnectorDetail } from '@open-design/contracts';
import type { AppConfig, OrbitRunStartResponse, OrbitStatusResponse, SkillSummary } from '../../types';

/** Transport the Orbit automation section depends on. */
export interface OrbitPort {
  /** `GET /api/orbit/status`. Resolves `null` on failure — see the provider. */
  fetchStatus: () => Promise<OrbitStatusResponse | null>;
  /** The design-templates registry, unfiltered; the caller selects `scenario === 'orbit'`. */
  fetchTemplates: () => Promise<SkillSummary[]>;
  /** The connector catalogue, used to gate Orbit on "at least one connected integration". */
  fetchConnectors: () => Promise<ConnectorDetail[]>;
  /** Persist the given config to the daemon, then trigger a manual Orbit run. */
  runOrbit: (
    config: AppConfig,
    options?: {
      daemonProviders?: AppConfig['mediaProviders'] | null;
      syncMediaProviders?: boolean;
      locale?: string | null;
    },
  ) => Promise<OrbitRunStartResponse>;
  /** Poll on a fixed interval while a run is in flight. Returns unsubscribe. */
  subscribeStatusPolling: (onTick: () => void) => () => void;
  /** Re-check the connector count when the window regains focus. Returns unsubscribe. */
  subscribeWindowFocus: (onFocus: () => void) => () => void;
  /** Run a callback once after a delay (the "Copied" flash reset). Returns cancel. */
  scheduleTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}

/** Browser-subscription bridge the media-providers section depends on. All of
 *  its actual data transport (`onReloadMediaProviders`) is injected as a
 *  caller callback rather than owned by this port — the section itself
 *  fetches nothing. */
export interface MediaProvidersPort {
  /** Auto-dismiss the reload-success notice after a delay. Returns cancel. */
  scheduleReloadNoticeTimeout: (onTimeout: () => void, delayMs: number) => () => void;
}
