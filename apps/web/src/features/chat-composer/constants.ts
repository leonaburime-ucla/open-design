// Constants for the chat-composer slice. Plain data only — no React, transport,
// or DOM — so they are safe to import from rules, formatters, hooks, and
// components alike.
import type { PluginSourceKind } from '@open-design/contracts';

/**
 * The plugin source kinds that count as "My plugins" (user-installed) in the
 * composer's plugin picker, as opposed to bundled/official plugins.
 */
export const USER_PLUGIN_SOURCE_KINDS = new Set<PluginSourceKind>([
  'user',
  'project',
  'marketplace',
  'github',
  'url',
  'local',
]);

/**
 * Upper bound on element markup folded into the composer input so a huge node's
 * outerHTML can't swamp the prompt; the screenshot still attaches in full.
 */
export const MAX_ELEMENT_HTML_CHARS = 8000;
