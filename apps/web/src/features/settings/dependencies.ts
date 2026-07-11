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
import { fetchConnectors, fetchDesignTemplates, openExternalUrl } from '../../providers/registry';
import { scheduleMediaProvidersReloadNoticeTimeout } from '../../providers/media-providers';
import { scheduleByokFieldFocusTimeout } from '../../providers/byok-focus';
import {
  fetchCodexInstallStatus,
  fetchMcpInstallInfo,
  installCodexMcp,
  openMcpDeeplink,
  scheduleMcpCopyResetTimeout,
  subscribeOutsideClickAndEscape,
  uninstallCodexMcp,
} from '../../providers/mcp';
import {
  canUpgradeVelaPlan,
  fetchAmrWalletSnapshot,
  fetchVelaLoginStatus,
  formatVelaBalanceUsd,
} from '../../providers/daemon';
import { subscribeAmrLoginStatusEvent, subscribeAmrWindowResync } from '../../providers/amr';
import { scheduleAgentRescanNoticeTimeout, subscribeAgentInstallReturn } from '../../providers/agents';
import { testAgent } from '../../providers/connection-test';
import {
  fetchProjectLocations,
  openProjectLocationFolderDialog,
  scanProjectLocations,
  updateProjectLocations,
} from '../../providers/project-locations';
import type {
  AboutPort,
  AmrAccountPort,
  ByokFieldFocusPort,
  DaemonAgentPort,
  IntegrationsPort,
  MediaProvidersPort,
  OrbitPort,
  ProjectLocationsPort,
} from './ports';

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

/** Default binding: the BYOK field-focus cluster's deferred-focus timer bridge. */
export const byokFieldFocusPort: ByokFieldFocusPort = {
  scheduleFocusTimeout: scheduleByokFieldFocusTimeout,
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

/** Default binding: the About section's external-URL opener. */
export const aboutPort: AboutPort = {
  openExternalUrl,
};

/** Default binding: the AMR account cluster's vela status/wallet transport +
 *  the window-resync/login-status-event browser bridges. */
export const amrAccountPort: AmrAccountPort = {
  fetchLoginStatus: fetchVelaLoginStatus,
  fetchWalletSnapshot: fetchAmrWalletSnapshot,
  subscribeWindowResync: subscribeAmrWindowResync,
  subscribeLoginStatusEvent: subscribeAmrLoginStatusEvent,
};

/** Default binding: the local-CLI agent list cluster's connection-test
 *  transport + the registry's external-URL opener. */
export const daemonAgentPort: DaemonAgentPort = {
  testAgent,
  openExternalUrl,
  scheduleRescanNoticeTimeout: scheduleAgentRescanNoticeTimeout,
  subscribeInstallReturn: subscribeAgentInstallReturn,
  canUpgradeVelaPlan,
  formatVelaBalanceUsd,
};

/** Default binding: the Project Locations section's fetch/update/scan/
 *  open-folder-dialog transport. */
export const projectLocationsPort: ProjectLocationsPort = {
  fetchLocations: fetchProjectLocations,
  updateLocations: updateProjectLocations,
  scanLocations: scanProjectLocations,
  openFolderDialog: openProjectLocationFolderDialog,
};
