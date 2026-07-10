// Dumb import menu for the composer tools flyout: Figma / web / folder / design
// systems / project import rows, with a nested design-system switcher view. Only
// the root/designSystems view toggle is local; the link/switch transport comes
// as props.
import { useState } from 'react';
import { DesignSystemSwitchPicker } from '../../../components/DesignSystemSwitchPicker';
import { Icon } from '../../../components/Icon';
import type { TranslateFn } from '../types';

export function ToolsImportPanel({
  t,
  onLinkFolder,
  currentDesignSystemId,
  onSwitchDesignSystem,
}: {
  t: TranslateFn;
  onLinkFolder: () => Promise<void> | void;
  currentDesignSystemId?: string | null;
  // When omitted (no active project) the design-system import row stays
  // disabled with the existing "Coming soon" affordance so users aren't
  // routed into a picker that has nothing to PATCH. Returns true on a
  // successful PATCH so the picker can close itself; false leaves the
  // picker open so the user can retry.
  onSwitchDesignSystem?: (
    designSystemId: string | null,
    title: string | null,
  ) => Promise<boolean>;
}) {
  const [view, setView] = useState<'root' | 'designSystems'>('root');

  if (view === 'designSystems' && onSwitchDesignSystem) {
    return (
      <DesignSystemSwitchPicker
        t={t}
        currentDesignSystemId={currentDesignSystemId}
        onSelect={onSwitchDesignSystem}
        onBack={() => setView('root')}
      />
    );
  }

  return (
    <div className="composer-tools-list">
      <ImportItem icon="upload" label={t('chat.importFig')} t={t} />
      <ImportItem icon="grid" label={t('chat.importWeb')} t={t} />
      <ImportItem
        icon="folder"
        label={t('chat.importFolder')}
        t={t}
        enabled
        onClick={() => void onLinkFolder()}
      />
      <ImportItem
        icon="sparkles"
        label={t('chat.importSkills')}
        t={t}
        enabled={!!onSwitchDesignSystem}
        onClick={() => setView('designSystems')}
        testId="composer-import-design-systems"
      />
      <ImportItem icon="file" label={t('chat.importProject')} t={t} />
    </div>
  );
}

function ImportItem({
  icon,
  label,
  t,
  enabled,
  onClick,
  testId,
}: {
  icon: "upload" | "link" | "grid" | "folder" | "sparkles" | "file";
  label: string;
  t: TranslateFn;
  enabled?: boolean;
  onClick?: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className={`composer-import-item${enabled ? ' composer-import-item-enabled' : ''}`}
      role="menuitem"
      tabIndex={-1}
      disabled={!enabled}
      title={enabled ? label : t('chat.importComingSoon')}
      onClick={enabled && onClick ? onClick : (e) => e.preventDefault()}
      data-testid={testId}
    >
      <span className="ico" aria-hidden>
        <Icon name={icon} size={14} />
      </span>
      <span className="composer-import-item-label">{label}</span>
      {!enabled && <span className="composer-import-item-soon">{t('chat.importSoon')}</span>}
    </button>
  );
}
