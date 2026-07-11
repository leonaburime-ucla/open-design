// Feature-local hook for the Project Locations settings section: the
// built-in/external project-folder list, the add-folder/remove/save/scan
// flow, and the default-location radio selection. Transport (fetch/update/
// scan/open-folder-dialog) is reached only through the injected
// `ProjectLocationsPort` (ADR 0002).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ProjectLocation } from '@open-design/contracts';
import { useI18n } from '../../../i18n';
import type { AppConfig } from '../../../types';
import type { ProjectLocationsPort } from '../ports';
import { projectLocationsPort } from '../dependencies';
import type { DraftLocation } from '../types';
import {
  externalLocations,
  projectLocationDefaultControlLabel,
  toConfigLocations,
} from '../rules';

/** Inputs the Project Locations section needs from its caller. */
export interface ProjectLocationsInput {
  cfg: AppConfig;
  setCfg: Dispatch<SetStateAction<AppConfig>>;
  onProjectsRefresh?: () => Promise<void> | void;
}

/** Everything the Project Locations section JSX reads off the controller. */
export interface ProjectLocationsController {
  builtIn: ProjectLocation | undefined;
  effectiveDefaultLocationId: string;
  drafts: DraftLocation[];
  loading: boolean;
  saving: boolean;
  status: string | null;
  error: string | null;
  /** Label for a location row's default-radio control — badge when it's
   *  already the default, an actionable "Make default" otherwise. */
  defaultControlLabel: (locationId: string) => string;
  handleDefaultLocationChange: (locationId: string) => void;
  handleAddFolder: () => void;
  removeDraft: (index: number) => void;
}

export function useProjectLocations(
  port: ProjectLocationsPort,
  input: ProjectLocationsInput,
): ProjectLocationsController {
  const { cfg, setCfg, onProjectsRefresh } = input;
  const { t } = useI18n();
  const [locations, setLocations] = useState<ProjectLocation[]>([]);
  const [drafts, setDrafts] = useState<DraftLocation[]>(cfg.projectLocations ?? []);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draftsRef = useRef<DraftLocation[]>(drafts);

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    port
      .fetchLocations()
      .then((next) => {
        if (cancelled) return;
        setLocations(next);
        setDrafts(externalLocations(next));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Mirrors the original effect's `[setCfg]` dependency — `setCfg` is a
    // stable setState identity, so this still only runs once on mount.
  }, [setCfg]);

  const builtIn = useMemo(
    () => locations.find((location) => location.builtIn),
    [locations],
  );
  const effectiveDefaultLocationId = useMemo(() => {
    const configured = cfg.defaultProjectLocationId ?? 'default';
    return locations.some((location) => location.id === configured) ? configured : 'default';
  }, [cfg.defaultProjectLocationId, locations]);

  const defaultControlLabel = (locationId: string) =>
    projectLocationDefaultControlLabel(t, effectiveDefaultLocationId, locationId);

  function handleDefaultLocationChange(locationId: string) {
    setError(null);
    setStatus(t('settings.projectLocationsDefaultSaved'));
    setCfg((current) => ({ ...current, defaultProjectLocationId: locationId }));
  }

  async function save(nextDrafts: DraftLocation[]) {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const saved = await port.updateLocations(
        nextDrafts.filter((location) => location.path.trim()),
      );
      if (!saved) {
        setError(t('settings.projectLocationsSaveError'));
        return null;
      }
      setLocations(saved);
      const external = externalLocations(saved);
      setDrafts(external);
      setCfg((current) => {
        const configuredDefault = current.defaultProjectLocationId ?? 'default';
        const nextDefault = saved.some((location) => location.id === configuredDefault)
          ? configuredDefault
          : 'default';
        return {
          ...current,
          projectLocations: toConfigLocations(saved),
          defaultProjectLocationId: nextDefault,
        };
      });
      setStatus(t('settings.projectLocationsSaved'));
      void onProjectsRefresh?.();
      return external;
    } finally {
      setSaving(false);
    }
  }

  async function runScan() {
    const result = await port.scanLocations();
    if (!result) {
      setError(t('settings.projectLocationsScanError'));
      return null;
    }
    setStatus(t('settings.projectLocationsScanComplete', {
      imported: result.imported.length,
      existing: result.existing.length,
    }));
    void onProjectsRefresh?.();
    return result;
  }

  async function handleAddFolder() {
    setError(null);
    setStatus(null);
    const selected = await port.openFolderDialog();
    if (!selected) {
      setStatus(t('settings.projectLocationsNoFolderSelected'));
      return;
    }
    if (draftsRef.current.some((draft) => draft.path === selected)) {
      setStatus(t('settings.projectLocationsDuplicate'));
      return;
    }
    const previous = draftsRef.current;
    const next = [...previous, { path: selected }];
    setDrafts(next);
    const saved = await save(next);
    if (!saved) setDrafts(previous);
    else await runScan();
  }

  async function removeDraft(index: number) {
    const previous = draftsRef.current;
    const next = previous.filter((_, i) => i !== index);
    setDrafts(next);
    const saved = await save(next);
    if (!saved) setDrafts(previous);
  }

  return {
    builtIn,
    effectiveDefaultLocationId,
    drafts,
    loading,
    saving,
    status,
    error,
    defaultControlLabel,
    handleDefaultLocationChange,
    handleAddFolder: () => void handleAddFolder(),
    removeDraft: (index: number) => void removeDraft(index),
  };
}

/**
 * Wirer: binds the real provider port and returns a ready-to-call hook. This
 * is the default the orchestrator injects; swap it via a port param in
 * tests.
 */
export function useWiredProjectLocations(input: ProjectLocationsInput): ProjectLocationsController {
  return useProjectLocations(projectLocationsPort, input);
}
