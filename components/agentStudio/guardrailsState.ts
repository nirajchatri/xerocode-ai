/** Types + normalization for structured Guardrails node configuration (workflow JSON under `guardrailsState`). */

export type GuardrailCheckId =
  | 'pii'
  | 'moderation'
  | 'jailbreak'
  | 'hallucination'
  | 'nsfw'
  | 'urlFilter'
  | 'promptInjection'
  | 'customPrompt';

export interface GuardrailsState {
  displayName: string;
  inputBinding: string;
  inputType: string;
  continueOnError: boolean;
  checkEnabled: Record<GuardrailCheckId, boolean>;
  pii: { mode: 'mask' | 'block'; entities: string[] };
  moderation: { categories: string[] };
  jailbreak: { model: string; confidence: number };
  hallucination: { vectorStoreId: string; model: string; confidence: number };
  nsfw: { model: string; confidence: number };
  urlFilter: {
    allowList: string[];
    schemes: string[];
    blockUserInfo: boolean;
    allowSubdomains: boolean;
  };
  promptInjection: { model: string; confidence: number };
  customPrompt: { prompt: string; model: string; confidence: number };
}

/** Persisted subset (stored on `AgentNodeData.guardrailsState`). */
export type SerializedGuardrails = Partial<
  Omit<
    GuardrailsState,
    | 'checkEnabled'
    | 'pii'
    | 'moderation'
    | 'jailbreak'
    | 'hallucination'
    | 'nsfw'
    | 'urlFilter'
    | 'promptInjection'
    | 'customPrompt'
  >
> & {
  checkEnabled?: Partial<Record<GuardrailCheckId, boolean>>;
  pii?: Partial<GuardrailsState['pii']>;
  moderation?: Partial<GuardrailsState['moderation']>;
  jailbreak?: Partial<GuardrailsState['jailbreak']>;
  hallucination?: Partial<GuardrailsState['hallucination']>;
  nsfw?: Partial<GuardrailsState['nsfw']>;
  urlFilter?: Partial<GuardrailsState['urlFilter']>;
  promptInjection?: Partial<GuardrailsState['promptInjection']>;
  customPrompt?: Partial<GuardrailsState['customPrompt']>;
};

const DEFAULT_MODEL = 'gpt-4.1-mini';

export function defaultGuardrailsState(): GuardrailsState {
  return {
    displayName: 'Guardrails',
    inputBinding: 'input_as_text',
    inputType: 'STRING',
    continueOnError: false,
    checkEnabled: {
      pii: false,
      moderation: false,
      jailbreak: false,
      hallucination: false,
      nsfw: false,
      urlFilter: false,
      promptInjection: false,
      customPrompt: false,
    },
    pii: { mode: 'mask', entities: [] },
    moderation: { categories: [] },
    jailbreak: { model: DEFAULT_MODEL, confidence: 70 },
    hallucination: { vectorStoreId: '', model: DEFAULT_MODEL, confidence: 70 },
    nsfw: { model: DEFAULT_MODEL, confidence: 70 },
    urlFilter: { allowList: [], schemes: [], blockUserInfo: false, allowSubdomains: false },
    promptInjection: { model: DEFAULT_MODEL, confidence: 70 },
    customPrompt: { prompt: '', model: DEFAULT_MODEL, confidence: 70 },
  };
}

function mergeRecord<T extends object>(fallback: T, patch: Partial<T> | undefined): T {
  return patch ? { ...fallback, ...patch } : { ...fallback };
}

export function normalizeGuardrailsState(serialized?: SerializedGuardrails | null, legacyBlockPii?: boolean): GuardrailsState {
  const defs = defaultGuardrailsState();
  let out: GuardrailsState;

  if (!serialized || typeof serialized !== 'object') {
    out = { ...defs };
  } else {
    const ge = { ...defs.checkEnabled, ...(serialized.checkEnabled ?? {}) };
    out = {
      displayName: typeof serialized.displayName === 'string' ? serialized.displayName : defs.displayName,
      inputBinding: typeof serialized.inputBinding === 'string' ? serialized.inputBinding : defs.inputBinding,
      inputType: typeof serialized.inputType === 'string' ? serialized.inputType : defs.inputType,
      continueOnError:
        typeof serialized.continueOnError === 'boolean' ? serialized.continueOnError : defs.continueOnError,
      checkEnabled: ge as GuardrailsState['checkEnabled'],
      pii: mergeRecord(defs.pii, serialized.pii),
      moderation: mergeRecord(defs.moderation, serialized.moderation),
      jailbreak: mergeRecord(defs.jailbreak, serialized.jailbreak),
      hallucination: mergeRecord(defs.hallucination, serialized.hallucination),
      nsfw: mergeRecord(defs.nsfw, serialized.nsfw),
      urlFilter: mergeRecord(defs.urlFilter, serialized.urlFilter),
      promptInjection: mergeRecord(defs.promptInjection, serialized.promptInjection),
      customPrompt: mergeRecord(defs.customPrompt, serialized.customPrompt),
    };
  }

  if (legacyBlockPii && !serialized) {
    out.checkEnabled = { ...out.checkEnabled, pii: true };
  }
  return out;
}
