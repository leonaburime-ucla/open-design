// Feature-local hook for the About settings section: the app-version/channel
// display, the updater status subscription + check/download/install/quit
// action, the diagnostics-export row, and the reset-onboarding action. The
// updater status subscription and its actions reach `../../../lib/updater`
// directly — mirroring how `useOrbit` imports `navigate` directly (a host
// bridge module, not the `providers/` transport route the guard's
// port-binding rule targets). Only the release-notes link's external-URL
// open goes through the injected `AboutPort`, since `openExternalUrl` lives
// in `providers/registry`.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useI18n } from '../../../i18n';
import { navigate as navigateRoute } from '../../../router';
import { saveConfig, syncConfigToDaemon } from '../../../state/config';
import {
  checkForUpdaterUpdate,
  deriveUpdaterModel,
  downloadUpdaterUpdate,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  subscribeToUpdaterStatus,
  type UpdaterActionResult,
  type UpdaterModel,
} from '../../../lib/updater';
import type { AppConfig, AppVersionInfo } from '../../../types';
import { deriveAboutUpdateControl } from '../rules';
import { OPEN_DESIGN_RELEASES_URL } from '../constants';
import { aboutPort } from '../dependencies';
import type { AboutPort } from '../ports';
import type { AboutUpdateControl } from '../types';

/** Inputs the About section needs from its caller. */
export interface AboutInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  appVersionInfo: AppVersionInfo | null;
  onClose: () => void;
}

/** Everything the About section JSX reads off the controller. */
export interface AboutController {
  updateControl: AboutUpdateControl;
  updaterModel: UpdaterModel;
  updateActionBusy: boolean;
  toast: string | null;
  dismissToast: () => void;
  handleUpdateAction: () => Promise<void>;
  handleOpenReleaseNotes: () => void;
  handleResetOnboarding: () => void;
}

export function useAbout(port: AboutPort, input: AboutInput): AboutController {
  const { cfg, setCfg, appVersionInfo, onClose } = input;
  const { t } = useI18n();
  const [updaterModel, setUpdaterModel] = useState<UpdaterModel>(() => deriveUpdaterModel(null));
  const [updateActionBusy, setUpdateActionBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToUpdaterStatus((status) => {
      if (!mounted) return;
      setUpdaterModel(deriveUpdaterModel(status, { hostAvailable: true }));
    });
    void readUpdaterStatus({ payload: { source: 'settings-about:mount' } }).then((result) => {
      if (!mounted) return;
      setUpdaterModel(result.ok ? result.model : deriveUpdaterModel(null, { hostAvailable: false }));
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const updateControl = useMemo(
    () => deriveAboutUpdateControl(updaterModel, appVersionInfo),
    [updaterModel, appVersionInfo],
  );

  const applyUpdaterResult = useCallback((result: UpdaterActionResult): boolean => {
    if (!result.ok) {
      setToast(t('settings.updateActionFailed'));
      return false;
    }
    setUpdaterModel(result.model);
    if (result.model.errorMessage != null) {
      setToast(t('settings.updateActionFailed'));
      return false;
    }
    return true;
  }, []);

  const handleUpdateAction = useCallback(async () => {
    if (updateActionBusy || updaterModel.busy || updateControl.primaryAction == null) return;
    setUpdateActionBusy(true);
    try {
      const options = { payload: { source: 'settings-about' } };
      if (updateControl.primaryAction === 'check') {
        applyUpdaterResult(await checkForUpdaterUpdate(options));
      } else if (updateControl.primaryAction === 'download') {
        applyUpdaterResult(await downloadUpdaterUpdate(options));
      } else if (updateControl.primaryAction === 'quit') {
        const quitResult = await quitAfterUpdaterInstallerOpen(options);
        if (!quitResult.ok) setToast(t('settings.updateQuitFailed'));
      } else {
        const installed = applyUpdaterResult(await openUpdaterInstaller(options));
        if (installed) {
          const quitResult = await quitAfterUpdaterInstallerOpen(options);
          if (!quitResult.ok) setToast(t('settings.updateQuitFailed'));
        }
      }
    } catch {
      setToast(t('settings.updateActionFailed'));
    } finally {
      setUpdateActionBusy(false);
    }
  }, [updateActionBusy, updateControl.primaryAction, updaterModel.busy, applyUpdaterResult]);

  const handleOpenReleaseNotes = useCallback(() => {
    port.openExternalUrl(OPEN_DESIGN_RELEASES_URL);
  }, [port]);

  // Precise inverse of App.handleCompleteOnboarding: flip
  // onboardingCompleted back to false, mirror it to localStorage and the
  // daemon through the same config-persist path, then route the user into
  // the first-run flow so they can replay setup (including brand extraction).
  const handleResetOnboarding = useCallback(() => {
    const next: AppConfig = { ...cfg, onboardingCompleted: false };
    setCfg(next);
    saveConfig(next);
    void syncConfigToDaemon(next);
    onClose();
    navigateRoute({ kind: 'home', view: 'onboarding' });
  }, [cfg, setCfg, onClose]);

  const dismissToast = useCallback(() => setToast(null), []);

  return {
    updateControl,
    updaterModel,
    updateActionBusy,
    toast,
    dismissToast,
    handleUpdateAction,
    handleOpenReleaseNotes,
    handleResetOnboarding,
  };
}

export function useWiredAbout(input: AboutInput): AboutController {
  return useAbout(aboutPort, input);
}
