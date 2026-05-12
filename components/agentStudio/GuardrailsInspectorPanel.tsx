import React, { useCallback, useId, useMemo, useState } from 'react';
import { CircleHelp, FileText, Settings, X } from 'lucide-react';

import type { AgentNodeData } from './agentNodeData';
import { GuardrailsModalBody } from './GuardrailsModals';
import type { GuardrailCheckId, GuardrailsState, SerializedGuardrails } from './guardrailsState';
import { normalizeGuardrailsState } from './guardrailsState';

function inputCls(isDark: boolean): string {
  return `w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
}

function labelCol(isDark: boolean): string {
  return isDark ? 'text-slate-400' : 'text-slate-600';
}

function SwitchToggle({
  checked,
  onChange,
  isDarkMode,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  isDarkMode: boolean;
}) {
  const cid = useId();
  const id = `gb-sw-${cid.replace(/:/g, '')}`;
  const track = isDarkMode ? 'bg-slate-600' : 'bg-slate-300';
  return (
    <label htmlFor={id} className="relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full focus-within:outline-none focus-within:ring-2 focus-within:ring-rose-500/50">
      <input id={id} type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={`absolute inset-0 rounded-full transition-colors ${track} peer-checked:bg-rose-600`} />
      <span className="pointer-events-none absolute left-1 top-1 z-[1] h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ease-out peer-checked:translate-x-[1.125rem]" />
    </label>
  );
}

const CHECK_ROWS: ReadonlyArray<{
  id: GuardrailCheckId;
  label: string;
  modalTitle: string;
  modalDesc: string;
}> = [
  {
    id: 'pii',
    label: 'Personally identifiable information',
    modalTitle: 'Personally identifiable information (PII) guardrail',
    modalDesc:
      'Detects sensitive personal data so you can block a request or mask the details before it reaches the model.',
  },
  {
    id: 'moderation',
    label: 'Moderation',
    modalTitle: 'Moderation guardrail',
    modalDesc: 'Flag text containing disallowed content categories.',
  },
  {
    id: 'jailbreak',
    label: 'Jailbreak',
    modalTitle: 'Jailbreak guardrail',
    modalDesc:
      'Flags attempts to bypass AI safety rules, such as prompt injection, role-playing, or system prompt overrides.',
  },
  {
    id: 'hallucination',
    label: 'Hallucination',
    modalTitle: 'Hallucination guardrail',
    modalDesc:
      'Detect and flag hallucinations by verifying claims against trusted documents in your vector store.',
  },
  {
    id: 'nsfw',
    label: 'NSFW Text',
    modalTitle: 'NSFW guardrail',
    modalDesc:
      'Detects NSFW content such as sexual content, hate speech, violence, or other inappropriate material.',
  },
  {
    id: 'urlFilter',
    label: 'URL Filter',
    modalTitle: 'URL filter guardrail',
    modalDesc: 'Blocks URLs that fall outside your allow list or violate allowed schemes.',
  },
  {
    id: 'promptInjection',
    label: 'Prompt Injection Detection',
    modalTitle: 'Prompt injection detection guardrail',
    modalDesc:
      'Detects prompt injection attempts and misaligned outputs so your system prompt stays in control.',
  },
  {
    id: 'customPrompt',
    label: 'Custom Prompt Check',
    modalTitle: 'Custom prompt check guardrail',
    modalDesc: 'Evaluate text against your own system prompt and flag when it does not comply.',
  },
];

function serializeForPatch(state: GuardrailsState): SerializedGuardrails {
  return state as SerializedGuardrails;
}

export interface GuardrailsInspectorPanelProps {
  data: AgentNodeData;
  isDarkMode: boolean;
  onPatch: (patch: Partial<AgentNodeData>) => void;
}

export function GuardrailsInspectorPanel({ data: d, isDarkMode, onPatch }: GuardrailsInspectorPanelProps) {
  const gr = useMemo(() => normalizeGuardrailsState(d.guardrailsState, d.blockPii), [d.guardrailsState, d.blockPii]);

  const setGr = useCallback(
    (next: GuardrailsState) => {
      onPatch({
        guardrailsState: serializeForPatch(next),
        blockPii: next.checkEnabled.pii ? true : false,
      });
    },
    [onPatch]
  );

  const [modal, setModal] = useState<GuardrailCheckId | null>(null);
  const [draftUrlAllow, setDraftUrlAllow] = useState('');
  const [draftScheme, setDraftScheme] = useState('');
  const [wk, setWk] = useState<Partial<GuardrailsState>>({});

  const ic = inputCls(isDarkMode);
  const lb = labelCol(isDarkMode);

  const openConfig = useCallback(
    (id: GuardrailCheckId) => {
      const fresh = normalizeGuardrailsState(d.guardrailsState, d.blockPii);
      setModal(id);
      setWk({
        pii: { ...fresh.pii },
        moderation: { ...fresh.moderation },
        jailbreak: { ...fresh.jailbreak },
        hallucination: { ...fresh.hallucination },
        nsfw: { ...fresh.nsfw },
        urlFilter: { ...fresh.urlFilter },
        promptInjection: { ...fresh.promptInjection },
        customPrompt: { ...fresh.customPrompt },
      });
      setDraftUrlAllow('');
      setDraftScheme('');
    },
    [d.blockPii, d.guardrailsState]
  );

  const mergeWkIntoGr = useCallback((): GuardrailsState => {
    const fresh = normalizeGuardrailsState(d.guardrailsState, d.blockPii);
    return {
      ...fresh,
      pii: wk.pii ? { ...fresh.pii, ...wk.pii } : fresh.pii,
      moderation: wk.moderation ? { ...fresh.moderation, ...wk.moderation } : fresh.moderation,
      jailbreak: wk.jailbreak ? { ...fresh.jailbreak, ...wk.jailbreak } : fresh.jailbreak,
      hallucination: wk.hallucination ? { ...fresh.hallucination, ...wk.hallucination } : fresh.hallucination,
      nsfw: wk.nsfw ? { ...fresh.nsfw, ...wk.nsfw } : fresh.nsfw,
      urlFilter: wk.urlFilter ? { ...fresh.urlFilter, ...wk.urlFilter } : fresh.urlFilter,
      promptInjection: wk.promptInjection ? { ...fresh.promptInjection, ...wk.promptInjection } : fresh.promptInjection,
      customPrompt: wk.customPrompt ? { ...fresh.customPrompt, ...wk.customPrompt } : fresh.customPrompt,
    };
  }, [d.guardrailsState, d.blockPii, wk]);

  const applyModalSave = () => {
    if (!modal) return;
    const merged = mergeWkIntoGr();
    merged.checkEnabled = { ...merged.checkEnabled, [modal]: true };
    setGr(merged);
    setModal(null);
  };

  const cancelModal = () => setModal(null);

  const modalMeta = modal ? CHECK_ROWS.find((r) => r.id === modal) : undefined;

  const panelBg = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-900';

  return (
    <div className="space-y-4 text-[13px]">
      <label className={`block ${lb}`}>
        <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-400">Name</span>
        <input value={gr.displayName} onChange={(e) => setGr({ ...gr, displayName: e.target.value })} className={`${ic} ${isDarkMode ? 'bg-slate-950' : 'bg-slate-50'}`} />
      </label>

      <div>
        <span className={`mb-1 block text-[10px] font-bold uppercase tracking-wide ${lb}`}>Input</span>
        <div
          className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
            isDarkMode ? 'border-slate-700 bg-slate-950' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
              <FileText className="h-3.5 w-3.5" aria-hidden />
            </span>
            <select
              value={gr.inputBinding}
              onChange={(e) => setGr({ ...gr, inputBinding: e.target.value })}
              className={`min-w-0 flex-1 border-0 bg-transparent text-xs font-medium outline-none ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}
            >
              <option value="input_as_text">input_as_text</option>
              <option value="input_messages">input_messages</option>
              <option value="user_query">user_query</option>
            </select>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-600 dark:text-slate-400">
            {gr.inputType}
            <button
              type="button"
              className="rounded px-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800"
              aria-label="Cycle type"
              onClick={() => setGr({ ...gr, inputType: gr.inputType === 'STRING' ? 'JSON' : 'STRING' })}
            >
              ⇅
            </button>
          </div>
        </div>
      </div>

      <div
        className={`divide-y rounded-xl border overflow-hidden ${
          isDarkMode ? 'divide-slate-800 border-slate-700' : 'divide-slate-100 border-slate-200'
        }`}
      >
        {CHECK_ROWS.map((row) => (
          <div key={row.id} className={`flex items-center gap-2 px-3 py-2 ${isDarkMode ? 'bg-slate-950/40' : 'bg-white'}`}>
            <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-slate-800 dark:text-slate-200">{row.label}</span>
            <button
              type="button"
              className={`rounded p-1 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
              title={`About ${row.label}`}
              aria-label="Info"
            >
              <CircleHelp className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Configure"
              onClick={() => openConfig(row.id)}
              className={`rounded p-1 ${isDarkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Settings className="h-4 w-4" />
            </button>
            <SwitchToggle
              checked={gr.checkEnabled[row.id]}
              onChange={(v) => setGr({ ...gr, checkEnabled: { ...gr.checkEnabled, [row.id]: v } })}
              isDarkMode={isDarkMode}
            />
          </div>
        ))}
      </div>

      <div className={`flex items-center gap-2 border-t pt-3 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
        <span className="flex flex-1 items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
          Continue on error
          <CircleHelp className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
        </span>
        <SwitchToggle checked={gr.continueOnError} onChange={(v) => setGr({ ...gr, continueOnError: v })} isDarkMode={isDarkMode} />
      </div>

      {(d.rulesText || '').trim().length > 0 && (
        <label className={`block ${lb}`}>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide">Legacy notes</span>
          <textarea value={String(d.rulesText ?? '')} onChange={(e) => onPatch({ rulesText: e.target.value })} rows={3} className={`${ic} resize-y`} />
        </label>
      )}

      {modal && modalMeta && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <div
            className={`flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-xl border shadow-2xl ${panelBg} ${
              isDarkMode ? 'border-slate-600' : 'border-slate-200'
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`gr-modal-${modal}`}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className={`relative flex shrink-0 items-start gap-3 border-b px-4 py-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
              <div className="min-w-0 pr-10">
                <h2 id={`gr-modal-${modal}`} className="text-base font-bold leading-snug">
                  {modalMeta.modalTitle}
                </h2>
                <p className={`mt-1 text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{modalMeta.modalDesc}</p>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className={`absolute right-3 top-3 rounded-lg p-1 ${isDarkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-100'}`}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex flex-1 flex-col overflow-hidden">
              <GuardrailsModalBody
                modal={modal}
                isDarkMode={isDarkMode}
                gr={gr}
                wk={wk}
                setWk={setWk}
                draftUrlAllow={draftUrlAllow}
                setDraftUrlAllow={setDraftUrlAllow}
                draftScheme={draftScheme}
                setDraftScheme={setDraftScheme}
                onSave={applyModalSave}
                onCancel={cancelModal}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
