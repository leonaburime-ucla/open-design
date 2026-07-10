// UI-only types for the chat-composer slice. Wire DTOs live in
// `@open-design/contracts` and are imported, never redeclared; these are the
// view-model shapes the slice's rules, hooks, and components pass around
// (translate fn alias, picker tab identifiers, slash commands, the design
// toolbox resource union, and the composer's public imperative-handle contract).
import type {
  AppliedPluginSnapshot,
  ChatAnalyticsEntryFrom,
  ChatSessionMode,
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
  ResearchOptions,
  RunContextSelection,
} from '@open-design/contracts';
import type { ChatAttachment, ChatCommentAttachment, ProjectFile, SkillSummary } from '../../types';
import type { Dict } from '../../i18n/types';
import type { IconName } from '../../components/Icon';
import type { DesignToolboxActionId } from '../../runtime/design-toolbox';

/** The bound `t` translate function passed into pure helpers and dumb components. */
export type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

/** A workspace context whose folder was auto-linked when it was staged, plus the
 *  linked-dir snapshot to restore if the context is removed. */
export interface TrackedWorkspaceLinkedDir {
  dir: string;
  previousLinkedDirs: string[];
}

/** The tabs of the composer's tools flyout (plugins / skills / MCP / import). */
export type ToolsTab = 'plugins' | 'skills' | 'mcp' | 'import';

/** The tabs of the @-mention popover. */
export type MentionTab = 'all' | 'tabs' | 'files' | 'plugins' | 'skills' | 'mcp' | 'connectors';

/** A `/`-command entry shown in the slash popover. */
export interface SlashCommand {
  id: string;
  // Visible label, e.g. `/hatch`. Shown in the popover row.
  label: string;
  // Text inserted into the draft when the user picks the entry. The
  // cursor is positioned at the end of `insert`, so a trailing space
  // is the difference between a "ready for argument" command and a
  // "submit immediately" one.
  insert: string;
  // i18n key of the short description shown next to the label.
  descKey: keyof Dict;
  // Optional argument hint shown after the description.
  argHint?: string;
  // Icon glyph from the project Icon set.
  icon: 'sparkles' | 'eye' | 'sliders';
}

/** The kinds of resource surfaced in the design-toolbox panel. */
export type DesignToolboxResourceKind =
  | 'skill'
  | 'plugin'
  | 'mcp'
  | 'mcp-template'
  | 'connector'
  | 'file';

/** The full pool of resources the design toolbox indexes and searches over. */
export interface DesignToolboxResourceIndex {
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
}

/** The shared shape of every design-toolbox resource row. */
export type DesignToolboxResourceBase = {
  key: string;
  kind: DesignToolboxResourceKind;
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  icon: IconName;
  searchText: string;
};

/** A single design-toolbox resource, discriminated by `kind` with its payload. */
export type DesignToolboxResource =
  | (DesignToolboxResourceBase & { kind: 'skill'; skill: SkillSummary })
  | (DesignToolboxResourceBase & { kind: 'plugin'; plugin: InstalledPluginRecord })
  | (DesignToolboxResourceBase & { kind: 'mcp'; server: McpServerConfig })
  | (DesignToolboxResourceBase & { kind: 'mcp-template'; template: McpTemplate })
  | (DesignToolboxResourceBase & { kind: 'connector'; connector: ConnectorDetail })
  | (DesignToolboxResourceBase & { kind: 'file'; file: ProjectFile });

// Imperative handle so ancestors (e.g. example chips in ChatPane) can
// push text into the composer without owning its draft state.
export interface ChatComposerDraftOptions {
  entryFrom?: ChatAnalyticsEntryFrom;
  sessionMode?: ChatSessionMode;
}

export interface ChatComposerHandle {
  setDraft: (text: string, options?: ChatComposerDraftOptions) => void;
  restoreDraft: (draft: {
    text: string;
    attachments?: ChatAttachment[];
    commentAttachments?: ChatCommentAttachment[];
    /**
     * The queued turn's meta. When present, restoreDraft rebuilds the staged
     * plugin / connector / skill / MCP context (and re-shows their chips) so
     * editing a queued item keeps its bindings instead of silently dropping
     * them.
     */
    meta?: ChatSendMeta;
  }) => void;
  focus: () => void;
  /**
   * Run a design-toolbox action by id from outside the composer (e.g. the
   * assistant "next step" card). Resolves the action, matches its preferred
   * skill, and seeds the composer draft with the action prompt + `@skill`
   * mention — identical to picking the action inside the toolbox panel, so the
   * draft still waits for the user to send. No-op for an unknown id.
   */
  applyDesignToolboxAction: (id: DesignToolboxActionId) => void;
  /**
   * Seed the composer with a specific skill by id (same path as picking it in
   * the toolbox panel). Used by the next-step card's full skill list. No-op for
   * an unknown id.
   */
  applyDesignToolboxSkill: (skillId: string) => void;
  /** Legacy: open the standalone toolbox popover. Currently unused by callers. */
  openDesignToolbox: () => void;
}

export interface ChatSendMeta {
  queueOnly?: boolean;
  research?: ResearchOptions;
  context?: RunContextSelection;
  appliedPluginSnapshot?: AppliedPluginSnapshot;
  appliedPluginSnapshotId?: string;
  inlineAppliedPlugin?: {
    pluginId: string;
    label: string;
  };
  // Per-turn skill ids picked via the @-mention popover. The chat layer
  // forwards these to the daemon's `skillIds` field so the system prompt
  // for this run only is composed with the extra skill bodies, without
  // touching the project's persistent `skillId`.
  skillIds?: string[];
  /** Overrides the run_created / run_finished `entry_from` analytics prop for
   *  this send (e.g. 'mark' when the turn is sent from the Mark draw overlay).
   *  Behavior never depends on it; it only shapes PostHog props. */
  entryFrom?: ChatAnalyticsEntryFrom;
  /** One-shot run mode override for seeded follow-ups before parent state catches up. */
  sessionMode?: ChatSessionMode;
}
