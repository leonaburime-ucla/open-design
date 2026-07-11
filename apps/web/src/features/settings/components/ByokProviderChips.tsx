// The BYOK provider protocol-chip row (Anthropic / OpenAI / Azure / Gemini /
// Ollama / ...). Purely presentational — the option list, selection, and
// configured-status derivation all live in `rules.ts`/the orchestrator; this
// component only renders the row and reports which chip was clicked.
//
// Consumed by the SettingsDialog orchestrator through the slice barrel
// (ADR 0002).
import type { ByokProviderPreset } from '../types';

interface ByokProviderChipsProps {
  ariaLabel: string;
  options: ReadonlyArray<ByokProviderPreset>;
  selectedId: string | undefined;
  isConfigured: (provider: ByokProviderPreset) => boolean;
  configuredLabel: string;
  unsetLabel: string;
  /** `active` is whether this chip was already selected at click time —
   *  callers use it to skip re-selecting the active provider while still
   *  tracking the click. */
  onSelect: (provider: ByokProviderPreset, active: boolean) => void;
}

export function ByokProviderChips({
  ariaLabel,
  options,
  selectedId,
  isConfigured,
  configuredLabel,
  unsetLabel,
  onSelect,
}: ByokProviderChipsProps) {
  return (
    <div
      className="protocol-chips protocol-chips--providers"
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className="protocol-chip-group protocol-chip-group--providers">
        <div className="protocol-chip-group-options">
          {options.map((provider) => {
            const active = selectedId === provider.id;
            const configured = isConfigured(provider);
            const statusLabel = configured ? configuredLabel : unsetLabel;
            return (
              <button
                key={provider.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={provider.title}
                className={'protocol-chip protocol-chip--provider' + (active ? ' active' : '')}
                title={`${provider.title} - ${statusLabel}`}
                onClick={() => onSelect(provider, active)}
              >
                <span
                  className={`protocol-chip-status${configured ? ' is-configured' : ' is-unset'}`}
                  aria-hidden
                />
                <span>{provider.title}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
