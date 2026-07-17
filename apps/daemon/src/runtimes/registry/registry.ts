import {
  amrAgentDef,
  claudeAgentDef,
  codexAgentDef,
  devinAgentDef,
  opencodeAgentDef,
  hermesAgentDef,
  traeCliAgentDef,
  grokBuildAgentDef,
  kimiAgentDef,
  cursorAgentDef,
  qwenAgentDef,
  qoderAgentDef,
  copilotAgentDef,
  ampAgentDef,
  piAgentDef,
  kiroAgentDef,
  kiloAgentDef,
  vibeAgentDef,
  deepseekAgentDef,
  aiderAgentDef,
  antigravityAgentDef,
  codebuddyAgentDef,
  reasonixAgentDef,
  mimoAgentDef,
} from '../defs/index.js';
import { readLocalAgentProfileDefs as readLocalAgentProfileDefsFromFile } from './local-profiles.js';
import type { RuntimeAgentDef } from '../core/index.js';

const BASE_AGENT_DEFS: RuntimeAgentDef[] = [
  amrAgentDef,
  claudeAgentDef,
  codexAgentDef,
  devinAgentDef,
  opencodeAgentDef,
  hermesAgentDef,
  traeCliAgentDef,
  grokBuildAgentDef,
  kimiAgentDef,
  cursorAgentDef,
  qwenAgentDef,
  qoderAgentDef,
  copilotAgentDef,
  ampAgentDef,
  piAgentDef,
  kiroAgentDef,
  kiloAgentDef,
  vibeAgentDef,
  deepseekAgentDef,
  aiderAgentDef,
  antigravityAgentDef,
  reasonixAgentDef,
  codebuddyAgentDef,
  mimoAgentDef,
];

export function readLocalAgentProfileDefs(
  baseDefs: RuntimeAgentDef[] = BASE_AGENT_DEFS,
): RuntimeAgentDef[] {
  return readLocalAgentProfileDefsFromFile(baseDefs);
}

export const AGENT_DEFS: RuntimeAgentDef[] = [
  ...BASE_AGENT_DEFS,
  ...readLocalAgentProfileDefs(BASE_AGENT_DEFS),
];

const ids = new Set();
for (const def of AGENT_DEFS) {
  if (ids.has(def.id)) {
    throw new Error(`Duplicate agent definition id: ${def.id}`);
  }
  ids.add(def.id);
}

export function getAgentDef(id: string): RuntimeAgentDef | null {
  return AGENT_DEFS.find((a) => a.id === id) || null;
}
