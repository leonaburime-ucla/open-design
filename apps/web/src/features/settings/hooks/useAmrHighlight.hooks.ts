// Feature-local hook for the execution-mode section's one-shot AMR-card nudge:
// scrolling the card into view, a brief pulse, and arming the sign-in
// coachmark when the caller opens Settings with `initialHighlight === 'amr'`
// (the failed-run nudge). Pure UI/timing state — no transport, so unlike
// `useAmrAccount` this hook needs no port/`useWiredX` wrapper.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SettingsSection } from '../types';

/** Inputs the AMR-card nudge needs from its caller. */
export interface AmrHighlightInput {
  /** Mirrors `SettingsDialog`'s own `initialHighlight` prop, narrowed to the
   *  one value this hook reacts to (`'amr' | null`, matching
   *  `SettingsHighlight`, which the orchestrator still owns and exports). */
  initialHighlight: 'amr' | null;
  activeSection: SettingsSection;
}

/** Everything the execution-mode JSX reads off the AMR-card nudge. */
export interface AmrHighlightController {
  amrCardRef: RefObject<HTMLDivElement>;
  /** Card pulse: a brief attention flash that auto-clears after a few seconds. */
  amrHighlightActive: boolean;
  /** Coachmark: persists (unlike the card pulse) until the real pointer
   *  reaches the authorize button. */
  amrCoachmarkArmed: boolean;
  amrCoachmarkDismissed: boolean;
  /** Dismiss the coachmark — call on the authorize anchor's `onMouseEnter`. */
  dismissCoachmark: () => void;
}

export function useAmrHighlight(input: AmrHighlightInput): AmrHighlightController {
  const { initialHighlight, activeSection } = input;
  // AMR-card focus, driven by the failed-run nudge (`initialHighlight==='amr'`).
  const amrCardRef = useRef<HTMLDivElement | null>(null);
  const [amrHighlightActive, setAmrHighlightActive] = useState(false);
  const [amrCoachmarkArmed, setAmrCoachmarkArmed] = useState(false);
  const [amrCoachmarkDismissed, setAmrCoachmarkDismissed] = useState(false);

  // One-shot AMR-card focus from the failed-run nudge: scroll the card into
  // view (on the next frame, so it wins over the section's scrollTop reset)
  // and play a brief highlight + arm the sign-in coachmark. The coachmark
  // only actually shows when the AMR card reports a signed-out state
  // (`amrCardStatus?.loggedIn === false`). If the execution pane is in API
  // mode the AMR card is absent and this no-ops.
  useEffect(() => {
    if (initialHighlight !== 'amr' || activeSection !== 'execution') return;
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      amrCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setAmrCoachmarkDismissed(false);
      setAmrHighlightActive(true);
      setAmrCoachmarkArmed(true);
    });
    // Only the card pulse auto-clears; the coachmark persists until the pointer
    // reaches the authorize button (or the user signs in).
    const clear = setTimeout(() => {
      if (!cancelled) setAmrHighlightActive(false);
    }, 3200);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(clear);
    };
  }, [initialHighlight, activeSection]);

  const dismissCoachmark = useCallback(() => setAmrCoachmarkDismissed(true), []);

  return {
    amrCardRef,
    amrHighlightActive,
    amrCoachmarkArmed,
    amrCoachmarkDismissed,
    dismissCoachmark,
  };
}
