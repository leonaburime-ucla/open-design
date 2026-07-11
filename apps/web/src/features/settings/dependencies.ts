// Composition root for the settings slice: binds concrete transport adapters
// to the slice's ports. This is the ONE feature file allowed to import
// `providers/` — everything else in the slice depends on a port, so swapping
// the adapter (or a fake in tests) touches only this file.
import {
  fetchOrbitStatus,
  persistConfigAndRunOrbit,
  scheduleOrbitTimeout,
  subscribeOrbitStatusPolling,
  subscribeWindowFocus,
} from '../../providers/orbit';
import { fetchConnectors, fetchDesignTemplates } from '../../providers/registry';
import { scheduleMediaProvidersReloadNoticeTimeout } from '../../providers/media-providers';
import {
  fetchCodexInstallStatus,
  fetchMcpInstallInfo,
  installCodexMcp,
  openMcpDeeplink,
  scheduleMcpCopyResetTimeout,
  subscribeOutsideClickAndEscape,
  uninstallCodexMcp,
} from '../../providers/mcp';
import type { IntegrationsPort, MediaProvidersPort, OrbitPort } from './ports';

/** Default binding: the real Orbit status/template/connector/run transport +
 *  browser-subscription bridges. */
export const orbitPort: OrbitPort = {
  fetchStatus: fetchOrbitStatus,
  fetchTemplates: fetchDesignTemplates,
  fetchConnectors,
  runOrbit: persistConfigAndRunOrbit,
  subscribeStatusPolling: subscribeOrbitStatusPolling,
  subscribeWindowFocus,
  scheduleTimeout: scheduleOrbitTimeout,
};

/** Default binding: the media-providers section's timer bridge. */
export const mediaProvidersPort: MediaProvidersPort = {
  scheduleReloadNoticeTimeout: scheduleMediaProvidersReloadNoticeTimeout,
};

/** Default binding: the Integrations (MCP install snippet) section's transport + bridges. */
export const integrationsPort: IntegrationsPort = {
  fetchInstallInfo: fetchMcpInstallInfo,
  fetchCodexStatus: fetchCodexInstallStatus,
  installCodex: installCodexMcp,
  uninstallCodex: uninstallCodexMcp,
  scheduleCopyResetTimeout: scheduleMcpCopyResetTimeout,
  subscribePickerDismiss: subscribeOutsideClickAndEscape,
  openDeeplink: openMcpDeeplink,
};
