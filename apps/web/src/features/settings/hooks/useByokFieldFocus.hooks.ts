// Feature-local hook for the BYOK execution-mode form's missing-field
// precondition notice + deferred focus. Owns the four field refs (API key,
// base URL, model select, custom model input) and the notice banner state;
// the connection-test/model-discovery clusters (still inline in
// `SettingsDialog.tsx`) and the protocol-switch focus effect all read this
// hook's controller as a param rather than owning their own copies of this
// state, per ADR 0002's "hook takes other clusters' outputs as params"
// composition pattern.
import { useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { ApiProtocol } from '../../../types';
import { useT } from '../../../i18n';
import {
  blockingByokDraftFields,
  blockingByokDraftIssues,
  type ByokDraftValidation,
} from '../../../components/byok/validation';
import type { ByokFieldFocusPort } from '../ports';
import { byokFieldFocusPort } from '../dependencies';
import { byokDraftIssueMessage, formatByokMissingFields } from '../rules';
import type { ByokPreconditionAction, ByokPreconditionNotice, ByokRequiredField } from '../types';

type Translate = ReturnType<typeof useT>;

/** Inputs the BYOK field-focus cluster needs from its caller. */
export interface ByokFieldFocusInput {
  apiProtocol: ApiProtocol;
  t: Translate;
}

/** Everything the BYOK execution-mode form (and its sibling connection-test /
 *  model-discovery clusters) read off this hook's controller. */
export interface ByokFieldFocusController {
  apiKeyInputRef: RefObject<HTMLInputElement>;
  baseUrlInputRef: RefObject<HTMLInputElement>;
  modelSelectRef: RefObject<HTMLButtonElement>;
  customModelInputRef: RefObject<HTMLInputElement>;
  byokPreconditionNotice: ByokPreconditionNotice | null;
  setByokPreconditionNotice: Dispatch<SetStateAction<ByokPreconditionNotice | null>>;
  focusByokRequiredField: (field: ByokRequiredField | undefined) => void;
  showByokPreconditionNotice: (action: ByokPreconditionAction, fields: ByokRequiredField[]) => void;
  showByokDraftValidationNotice: (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => void;
}

export function useByokFieldFocus(
  port: ByokFieldFocusPort,
  input: ByokFieldFocusInput,
): ByokFieldFocusController {
  const { apiProtocol, t } = input;

  const apiKeyInputRef = useRef<HTMLInputElement | null>(null);
  const baseUrlInputRef = useRef<HTMLInputElement | null>(null);
  const modelSelectRef = useRef<HTMLButtonElement | null>(null);
  const customModelInputRef = useRef<HTMLInputElement | null>(null);
  const [byokPreconditionNotice, setByokPreconditionNotice] =
    useState<ByokPreconditionNotice | null>(null);

  const focusByokRequiredField = (field: ByokRequiredField | undefined) => {
    if (!field) return;
    port.scheduleFocusTimeout(() => {
      if (field === 'api_key') {
        apiKeyInputRef.current?.focus();
        return;
      }
      if (field === 'base_url') {
        baseUrlInputRef.current?.focus();
        return;
      }
      if (customModelInputRef.current) {
        customModelInputRef.current.focus();
        return;
      }
      modelSelectRef.current?.focus();
    }, 0);
  };

  const showByokPreconditionNotice = (
    action: ByokPreconditionAction,
    fields: ByokRequiredField[],
  ) => {
    setByokPreconditionNotice({
      action,
      message: t('settings.testMissingFields', {
        fields: formatByokMissingFields(t, apiProtocol, fields),
      }),
    });
    focusByokRequiredField(fields[0]);
  };

  const showByokDraftValidationNotice = (
    action: ByokPreconditionAction,
    validation: ByokDraftValidation,
  ) => {
    const blockingFields = blockingByokDraftFields(validation);
    if (blockingFields.length === 0) return;
    const blockingIssues = blockingByokDraftIssues(validation);
    const missingFields = blockingIssues
      .filter((issue) =>
        issue.code === 'api_key_required' ||
        issue.code === 'base_url_required' ||
        issue.code === 'model_required'
      )
      .map((issue) => issue.field);
    if (missingFields.length > 0) {
      showByokPreconditionNotice(action, missingFields);
      return;
    }
    const firstIssue = blockingIssues[0];
    if (!firstIssue) return;
    setByokPreconditionNotice({
      action,
      field: firstIssue.field,
      message: byokDraftIssueMessage(t, apiProtocol, firstIssue),
    });
    focusByokRequiredField(firstIssue.field);
  };

  return {
    apiKeyInputRef,
    baseUrlInputRef,
    modelSelectRef,
    customModelInputRef,
    byokPreconditionNotice,
    setByokPreconditionNotice,
    focusByokRequiredField,
    showByokPreconditionNotice,
    showByokDraftValidationNotice,
  };
}

/**
 * Wirer: binds the real focus-timer port and returns a ready-to-call hook.
 * This is the default the orchestrator injects; swap it via a port param in
 * tests.
 */
export function useWiredByokFieldFocus(input: ByokFieldFocusInput): ByokFieldFocusController {
  return useByokFieldFocus(byokFieldFocusPort, input);
}
