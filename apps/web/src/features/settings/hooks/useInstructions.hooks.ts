// Feature-local hook for the custom-instructions settings section: a single
// free-text field persisted on `cfg.customInstructions`.
import type { Dispatch, SetStateAction } from 'react';
import type { AppConfig } from '../../../types';

/** Inputs the instructions section needs from its caller. */
export interface InstructionsInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
}

/** Everything the Instructions section JSX reads off the controller. */
export interface InstructionsController {
  customInstructions: string;
  setCustomInstructions: (value: string) => void;
}

export function useInstructions(input: InstructionsInput): InstructionsController {
  const { cfg, setCfg } = input;

  const setCustomInstructions = (value: string) => {
    setCfg({ ...cfg, customInstructions: value || undefined });
  };

  return {
    customInstructions: cfg.customInstructions ?? '',
    setCustomInstructions,
  };
}
