/**
 * @module migration
 *
 * Public API for the daemon's version/data migration lifecycle. Groups the
 * previously flat top-level `legacy-data-migrator.ts` (one-shot import of a
 * legacy `.od/` data root on boot when `OD_LEGACY_DATA_DIR` is set) and
 * `update-apply-observations.ts` (records that a pending installer update was
 * applied across an app-version upgrade, for analytics) behind one folder
 * barrel. External daemon code imports only from here, never a file inside
 * this folder.
 */
export * from './legacy-data-migrator.js';
export * from './update-apply-observations.js';
