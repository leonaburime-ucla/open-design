// Feature-local hook for the Appearance settings section: the theme
// (system/light/dark) segmented control and the accent-color swatch picker.
// Applies the draft appearance to the document immediately on every change so
// the user sees a live preview before hitting Save (`SettingsDialog`'s own
// cleanup reverts this on cancel via its own `applyAppearanceToDocument`
// call). Reaches `state/appearance` directly — mirroring how `useOrbit`
// imports `navigate` directly — since it is a synchronous document-mutation
// helper, not the transport/DOM subscription the guard's port-binding rule
// targets (only `providers/` imports are restricted to `dependencies.ts`).
import { useLayoutEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  DEFAULT_ACCENT_COLOR,
  applyAppearanceToDocument,
  normalizeAccentColor,
} from '../../../state/appearance';
import type { AppConfig, AppTheme } from '../../../types';

/** Inputs the appearance section needs from its caller. */
export interface AppearanceInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

/** Everything the Appearance section JSX reads off the controller. */
export interface AppearanceController {
  theme: AppTheme;
  accentColor: string;
  setTheme: (theme: AppTheme) => void;
  setAccentColor: (color: string) => void;
}

export function useAppearance(input: AppearanceInput): AppearanceController {
  const { cfg, setCfg } = input;
  const theme = cfg.theme ?? 'system';
  const accentColor = normalizeAccentColor(cfg.accentColor) ?? DEFAULT_ACCENT_COLOR;

  // Apply the draft theme immediately so the user sees a live preview
  // before hitting Save. SettingsDialog's cleanup reverts this on cancel.
  useLayoutEffect(() => {
    applyAppearanceToDocument({ theme, accentColor });
  }, [theme, accentColor]);

  const setTheme = (next: AppTheme) => {
    setCfg((c) => ({ ...c, theme: next }));
  };

  const setAccentColor = (color: string) => {
    setCfg((c) => ({ ...c, accentColor: normalizeAccentColor(color) ?? c.accentColor ?? DEFAULT_ACCENT_COLOR }));
  };

  return { theme, accentColor, setTheme, setAccentColor };
}
