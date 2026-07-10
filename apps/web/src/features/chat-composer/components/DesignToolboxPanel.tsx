// Dumb design-toolbox panel: searchable follow-up actions + resource shortlist
// with a single shared, portaled hover-detail panel. Local search and
// hover-detail state only (small disclosure state, per the slice conventions);
// the action/resource data and pick handlers come as props. The two browser
// touchpoints — the viewport size (to clamp the hover panel) and the portal host
// — are INJECTED as props so this file stays DOM-free and passes the slice guard.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
} from '@open-design/contracts';
import type { ProjectFile, SkillSummary } from '../../../types';
import { useI18n } from '../../../i18n';
import { localizeSkillDescription, localizeSkillName } from '../../../i18n/content';
import { Icon, type IconName } from '../../../components/Icon';
import { ComposerPluginPreview } from '../../../components/ComposerPluginPreview';
import { computeToolboxDetailPosition } from '../../../components/composer-detail-position';
import {
  designToolboxActionBadge,
  designToolboxActionDescription,
  designToolboxActionMatchesQuery,
  designToolboxActionTitle,
  findDesignToolboxSkill,
  type DesignToolboxAction,
} from '../../../runtime/design-toolbox';
import {
  buildDesignToolboxResources,
  designToolboxDefaultResources,
  designToolboxResourceIsActive,
  designToolboxResourceMatchesQuery,
} from '../rules';
import { designToolboxResourceKindLabel } from '../formatters';
import type { DesignToolboxResource } from '../types';

export function DesignToolboxPanel({
  actions,
  skills,
  plugins,
  mcpServers,
  mcpTemplates,
  connectors,
  projectFiles,
  activeSkillIds,
  activePluginId,
  activeMcpServerIds,
  activeConnectorIds,
  activeFilePaths,
  getViewportSize,
  modalHost,
  onPickAction,
  onPickSkill,
  onPickResource,
  onOpened,
}: {
  actions: DesignToolboxAction[];
  skills: SkillSummary[];
  plugins: InstalledPluginRecord[];
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  projectFiles: ProjectFile[];
  activeSkillIds: string[];
  activePluginId: string | null;
  activeMcpServerIds: string[];
  activeConnectorIds: string[];
  activeFilePaths: string[];
  /** Current viewport size (bound provider bridge) used to clamp the hover panel. */
  getViewportSize: () => { width: number; height: number };
  /** Portal host for the hover-detail panel (the orchestrator resolves `document.body`). */
  modalHost: HTMLElement | null;
  onPickAction: (action: DesignToolboxAction) => void;
  onPickSkill: (skill: SkillSummary) => void;
  onPickResource: (resource: DesignToolboxResource) => void;
  onOpened?: () => void;
}) {
  const { locale, t } = useI18n();
  const [query, setQuery] = useState('');
  // Fire once when the toolbox panel mounts (i.e. the user opened it).
  useEffect(() => {
    onOpened?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const activeSkillSet = useMemo(() => new Set(activeSkillIds), [activeSkillIds]);
  const activeMcpServerSet = useMemo(() => new Set(activeMcpServerIds), [activeMcpServerIds]);
  const activeConnectorSet = useMemo(() => new Set(activeConnectorIds), [activeConnectorIds]);
  const activeFileSet = useMemo(() => new Set(activeFilePaths), [activeFilePaths]);
  const resources = useMemo(
    () =>
      buildDesignToolboxResources({
        skills,
        plugins,
        mcpServers,
        mcpTemplates,
        connectors,
        projectFiles,
        locale,
        t,
      }),
    [connectors, locale, mcpServers, mcpTemplates, plugins, projectFiles, skills, t],
  );
  const visibleActions = useMemo(
    () =>
      actions.filter((action) => {
        const skill = findDesignToolboxSkill(action, skills);
        return designToolboxActionMatchesQuery(
          action,
          query,
          skill,
          t,
          skill ? [localizeSkillName(locale, skill), localizeSkillDescription(locale, skill)] : [],
        );
      }),
    [actions, query, skills, locale, t],
  );
  const visibleResources = useMemo(
    () => {
      const source = query
        ? resources.filter((resource) => designToolboxResourceMatchesQuery(resource, query))
        : designToolboxDefaultResources(actions, resources);
      return source.slice(0, query ? 14 : 8);
    },
    [actions, query, resources],
  );

  // One shared hover-detail panel for the whole list — swapping a single
  // portaled panel as the cursor sweeps rows, instead of one panel per row
  // (which ghosted: the close delay left several stacked on screen at once).
  const [toolboxDetail, setToolboxDetail] = useState<{
    key: string;
    left: number;
    top: number;
    node: ReactNode;
  } | null>(null);
  const detailCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function cancelDetailClose() {
    if (detailCloseTimer.current) {
      clearTimeout(detailCloseTimer.current);
      detailCloseTimer.current = null;
    }
  }
  function showToolboxDetail(key: string, rect: DOMRect, node: ReactNode) {
    cancelDetailClose();
    // Plugin rows render a tall visual preview; the helper clamps both axes
    // into the viewport so the fixed panel never lands off-screen on a
    // narrow pane (see computeToolboxDetailPosition).
    const { left, top } = computeToolboxDetailPosition(
      rect,
      getViewportSize(),
      { detailWidth: 264, gap: 8, margin: 8, estimatedHeight: 340 },
    );
    setToolboxDetail({ key, left, top, node });
  }
  function scheduleToolboxDetailClose(key: string) {
    cancelDetailClose();
    detailCloseTimer.current = setTimeout(() => {
      setToolboxDetail((cur) => (cur?.key === key ? null : cur));
      detailCloseTimer.current = null;
    }, 160);
  }
  useEffect(() => () => cancelDetailClose(), []);

  return (
    <>
      <div className="composer-design-toolbox-head">
        <div className="composer-design-toolbox-title">
          <Icon name="lightbulb" size={14} />
          <span>{t('chat.designToolbox.title')}</span>
        </div>
      </div>
      <div className="plus-menu__search">
        <Icon name="search" size={13} />
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder={t('chat.designToolbox.searchPlaceholder')}
          aria-label={t('chat.designToolbox.searchAria')}
        />
      </div>
      {visibleActions.length > 0 || visibleResources.length > 0 ? (
        <div className="plus-menu__list">
          {visibleActions.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.followupSection')}
            </div>
          ) : null}
          {visibleActions.map((action) => {
            const skill = findDesignToolboxSkill(action, skills);
            const actionTitle = designToolboxActionTitle(action, t);
            const actionDescription = designToolboxActionDescription(action, t);
            const skillName = skill ? localizeSkillName(locale, skill) : null;
            return (
              <ToolboxItemRow
                key={action.id}
                detailKey={action.id}
                icon={action.icon}
                name={actionTitle}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => onPickAction(action)}
                detail={
                  <>
                    <div className="plus-menu__detail-title">{actionTitle}</div>
                    {actionDescription ? (
                      <div className="plus-menu__detail-desc">{actionDescription}</div>
                    ) : null}
                    {skillName ? (
                      <div className="plus-menu__detail-skill">@{skillName}</div>
                    ) : null}
                    <div className="plus-menu__detail-badge">
                      {designToolboxActionBadge(action, t)}
                    </div>
                  </>
                }
              />
            );
          })}
          {visibleResources.length > 0 ? (
            <div className="plus-menu__section-label">
              {t('chat.designToolbox.resourcesSection')}
            </div>
          ) : null}
          {visibleResources.map((resource) => {
            const active = designToolboxResourceIsActive(resource, {
              skillIds: activeSkillSet,
              pluginId: activePluginId,
              mcpServerIds: activeMcpServerSet,
              connectorIds: activeConnectorSet,
              filePaths: activeFileSet,
            });
            return (
              <ToolboxItemRow
                key={resource.key}
                detailKey={resource.key}
                icon={resource.icon}
                name={resource.title}
                active={active}
                onHover={showToolboxDetail}
                onLeave={scheduleToolboxDetailClose}
                onPick={() => {
                  if (resource.kind === 'skill') {
                    onPickSkill(resource.skill);
                  } else {
                    onPickResource(resource);
                  }
                }}
                detail={
                  // Plugin rows reuse the rich visual preview (poster /
                  // sandboxed example iframe + meta); every other kind keeps
                  // the compact text detail since it has no preview asset.
                  resource.kind === 'plugin' ? (
                    <ComposerPluginPreview record={resource.plugin} locale={locale} />
                  ) : (
                    <>
                      <div className="plus-menu__detail-title">{resource.title}</div>
                      {resource.subtitle ? (
                        <div className="plus-menu__detail-desc">{resource.subtitle}</div>
                      ) : null}
                      <div className="plus-menu__detail-skill">
                        {designToolboxResourceKindLabel(resource.kind, t)}
                      </div>
                      <div className="plus-menu__detail-badge">
                        {active ? t('chat.designToolbox.selected') : resource.badge}
                      </div>
                    </>
                  )
                }
              />
            );
          })}
        </div>
      ) : (
        <div className="plus-menu__empty">
          {t('chat.designToolbox.noResources', { query })}
        </div>
      )}
      {toolboxDetail && modalHost
        ? createPortal(
            <div
              className="plus-menu__detail"
              style={{ left: toolboxDetail.left, top: toolboxDetail.top }}
              onMouseEnter={cancelDetailClose}
              onMouseLeave={() => scheduleToolboxDetailClose(toolboxDetail.key)}
            >
              {toolboxDetail.node}
            </div>,
            modalHost,
          )
        : null}
    </>
  );
}

// A single toolbox row, styled like the Connectors/Plugins submenu rows
// (single line: icon + name). Clicking applies the entry; hovering shows a
// third-level detail panel (title / description / @skill / badge). The detail
// panel is PORTALED to <body> because the parent flyout uses `overflow-y: auto`
// (height-capped scroll) which would otherwise clip a nested panel.
// The hover detail panel is owned by the PARENT
// (DesignToolboxPanel) as ONE shared panel — not per-row — so sweeping across
// rows swaps the single panel in place instead of stacking several portaled
// panels that briefly coexist (the close delay would otherwise leave 2-4 of
// them on screen at once, reading as ghosting). The row just reports hover
// enter/leave with its rect + detail node.
function ToolboxItemRow({
  icon,
  name,
  active,
  detailKey,
  detail,
  onHover,
  onLeave,
  onPick,
}: {
  icon: IconName;
  name: string;
  active?: boolean;
  detailKey: string;
  detail: ReactNode;
  onHover: (key: string, rect: DOMRect, detail: ReactNode) => void;
  onLeave: (key: string) => void;
  onPick: () => void;
}) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  return (
    <div
      ref={rowRef}
      className="plus-menu__subitem"
      onMouseEnter={() => {
        const r = rowRef.current?.getBoundingClientRect();
        if (r) onHover(detailKey, r, detail);
      }}
      onMouseLeave={() => onLeave(detailKey)}
    >
      <button
        type="button"
        role="menuitem"
        className={`plus-menu__item${active ? ' is-active' : ''}`}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onPick}
      >
        <Icon name={icon} size={14} className="plus-menu__item-icon" />
        <span>{name}</span>
      </button>
    </div>
  );
}
