// Feature-local hook for the Critique Theater settings toggle. Reaches
// `components/Theater`'s `useCritiqueTheaterEnabled`/`setCritiqueTheaterEnabled`
// directly — mirroring how `useOrbit` imports `navigate` directly — since
// that pair already encapsulates the browser-side localStorage read/write
// (and the daemon-side project-metadata PATCH when a project id is given);
// this hook is not the guard's port-binding target, only the `providers/`
// import restriction is.
//
// The toggle has two halves on opposite sides of the HTTP boundary:
//
//   * Browser-side: `useCritiqueTheaterEnabled` reads / writes the
//     `open-design:config` localStorage blob; this is what gates whether
//     `<CritiqueTheaterMount>` actually renders.
//   * Daemon-side: the rollout resolver in `server.ts` reads
//     `project.metadata.critiqueTheaterEnabled`, so the daemon only routes
//     runs through the critique pipeline when the active project's metadata
//     row says yes (or env / phase / skill policy overrides it).
//
// If we only wrote localStorage, the user would see the mount but every
// generation would still skip the critique pipeline server-side (Codex +
// lefarcen P1 on PR #1484). To keep the two halves in lockstep, the setter
// takes an optional `{ projectId }` and, when provided, does the
// read-merge-write PATCH on the project's metadata (already shipped by
// Phase 15 and exercised by the wireup PR).
//
// This section threads the currently-open project id when the dialog is
// opened from `/projects/:id`. When opened from the entry gallery (`/`), the
// toggle is localStorage-only, and a contextual hint tells the user that
// per-project persistence requires opening a project first. That matches the
// actual scope of the wire-up.
import { setCritiqueTheaterEnabled, useCritiqueTheaterEnabled } from '../../../components/Theater';
import { useRoute } from '../../../router';

/** Everything the Critique Theater section JSX reads off the controller. */
export interface CritiqueTheaterSettingsController {
  enabled: boolean;
  /** The currently-open project id (from `/projects/:id`), or `null` when
   *  the dialog was opened from the entry gallery. */
  activeProjectId: string | null;
  setEnabled: (next: boolean) => void;
}

export function useCritiqueTheaterSettings(): CritiqueTheaterSettingsController {
  const enabled = useCritiqueTheaterEnabled();
  const route = useRoute();
  const activeProjectId = route.kind === 'project' ? route.projectId : null;

  const setEnabled = (next: boolean) => {
    if (activeProjectId !== null) {
      void setCritiqueTheaterEnabled(next, { projectId: activeProjectId });
    } else {
      void setCritiqueTheaterEnabled(next);
    }
  };

  return { enabled, activeProjectId, setEnabled };
}
