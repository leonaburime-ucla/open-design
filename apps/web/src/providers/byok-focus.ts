// Browser-subscription bridge for the BYOK execution-mode form's
// missing-field focus behavior. It has no data transport of its own — moving
// focus to the right input is a caller callback — so this file holds only
// the timer bridge the section needs to stay DOM-free (ADR 0002). The `0`ms
// delay it schedules with lets the precondition notice render before focus
// moves, matching the original inline `window.setTimeout(..., 0)`.
export function scheduleByokFieldFocusTimeout(
  onTimeout: () => void,
  delayMs: number,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handle = window.setTimeout(onTimeout, delayMs);
  return () => window.clearTimeout(handle);
}
