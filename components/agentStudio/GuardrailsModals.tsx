import React, { useId } from 'react';
import { Plus } from 'lucide-react';

import { useGuardrailsCatalog } from '../guardrails/GuardrailsCatalogContext';
import type { GuardrailCheckId, GuardrailsState } from './guardrailsState';

function inputCls(isDark: boolean): string {
  return `w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${
    isDark ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
}

function labelMuted(isDark: boolean) {
  return isDark ? 'text-slate-400' : 'text-slate-600';
}

function SwitchToggleMini({
  checked,
  onChange,
  isDarkMode,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  isDarkMode: boolean;
}) {
  const cid = useId().replace(/:/g, '');
  const id = `gmini-${cid}`;
  const track = isDarkMode ? 'bg-slate-600' : 'bg-slate-300';
  return (
    <label htmlFor={id} className="relative inline-flex h-7 w-11 shrink-0 cursor-pointer items-center rounded-full">
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className={`absolute inset-0 rounded-full transition-colors ${track} peer-checked:bg-rose-600`} />
      <span className="pointer-events-none absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-[1.125rem]" />
    </label>
  );
}

export function ModalFooter({
  primaryLabel,
  primaryDisabled,
  onPrimary,
  onCancel,
  isDarkMode,
}: {
  primaryLabel?: string;
  primaryDisabled?: boolean;
  onPrimary?: () => void;
  onCancel: () => void;
  isDarkMode: boolean;
}) {
  return (
    <div className={`flex shrink-0 flex-wrap items-center justify-end gap-2 border-t px-4 py-3 ${isDarkMode ? 'border-slate-700' : 'border-slate-200'}`}>
      <button
        type="button"
        onClick={onCancel}
        className={`rounded-lg border px-4 py-2 text-sm font-semibold ${isDarkMode ? 'border-slate-600 text-slate-200 hover:bg-slate-800' : 'border-slate-300 hover:bg-slate-50'}`}
      >
        Cancel
      </button>
      <button
        type="button"
        disabled={primaryDisabled ?? !onPrimary}
        onClick={onPrimary}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-35 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {primaryLabel ?? 'Add'}
      </button>
    </div>
  );
}

type Wk = Partial<GuardrailsState>;

function ModalScrollShell({ scroll, footer }: { scroll: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 pt-1">{scroll}</div>
      {footer}
    </div>
  );
}

export function GuardrailsModalBody({
  modal,
  isDarkMode,
  gr,
  wk,
  setWk,
  draftUrlAllow,
  setDraftUrlAllow,
  draftScheme,
  setDraftScheme,
  onSave,
  onCancel,
}: {
  modal: GuardrailCheckId;
  isDarkMode: boolean;
  gr: GuardrailsState;
  wk: Wk;
  setWk: React.Dispatch<React.SetStateAction<Wk>>;
  draftUrlAllow: string;
  setDraftUrlAllow: (s: string) => void;
  draftScheme: string;
  setDraftScheme: (s: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const { catalog: wsCat, allPiiEntityIds, moderationCriticalSet } = useGuardrailsCatalog();
  const PII_REGION_GROUPS = wsCat.piiRegionGroups;
  const ALL_PII_ENTITY_IDS = allPiiEntityIds;
  const MODERATION_CATEGORIES = wsCat.moderationCategories;
  const GUARDRAIL_MODEL_OPTIONS = wsCat.guardrailModelOptions;

  const ic = inputCls(isDarkMode);
  const lb = labelMuted(isDarkMode);
  const pii = wk.pii ?? gr.pii;
  const mod = wk.moderation ?? gr.moderation;
  const jb = wk.jailbreak ?? gr.jailbreak;
  const hall = wk.hallucination ?? gr.hallucination;
  const ns = wk.nsfw ?? gr.nsfw;
  const uf = wk.urlFilter ?? gr.urlFilter;
  const pi = wk.promptInjection ?? gr.promptInjection;
  const cp = wk.customPrompt ?? gr.customPrompt;

  if (modal === 'pii') {
    const ent = new Set(pii.entities);
    const toggle = (id: string, on: boolean) => {
      const n = new Set(ent);
      if (on) n.add(id);
      else n.delete(id);
      setWk((prev) => ({ ...prev, pii: { ...pii, entities: [...n] } }));
    };
    const allOn = ALL_PII_ENTITY_IDS.every((id) => ent.has(id));
    const setMode = (m: 'mask' | 'block') => setWk((prev) => ({ ...prev, pii: { ...pii, mode: m } }));

    return (
      <ModalScrollShell
        scroll={
          <>
            <div className={`flex rounded-lg p-1 ${isDarkMode ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {(['mask', 'block'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${
                    pii.mode === m ? (isDarkMode ? 'bg-slate-700 text-white shadow' : 'bg-white text-slate-900 shadow-sm') : 'text-slate-500'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <label className={`flex cursor-pointer items-center gap-2 text-xs font-medium ${isDarkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                <input
                  type="checkbox"
                  checked={allOn}
                  className="rounded border-slate-400"
                  onChange={() =>
                    setWk((prev) => ({
                      ...prev,
                      pii: { ...pii, entities: allOn ? [] : [...ALL_PII_ENTITY_IDS] },
                    }))
                  }
                />
                Select all entities
              </label>
              <button
                type="button"
                className={`text-xs font-semibold ${isDarkMode ? 'text-sky-400' : 'text-sky-700'}`}
                onClick={() => setWk((prev) => ({ ...prev, pii: { ...pii, entities: [] } }))}
              >
                Clear
              </button>
            </div>
            <div className="mt-3 space-y-4 pr-1">
              {PII_REGION_GROUPS.map((g) => (
                <div key={g.region}>
                  <p className={`mb-2 text-[10px] font-bold uppercase tracking-wide ${lb}`}>{g.region}</p>
                  <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                    {g.entities.map((e) => (
                      <label key={e.id} className="flex cursor-pointer items-start gap-2 text-[11px]">
                        <input type="checkbox" className="mt-0.5 rounded border-slate-400" checked={ent.has(e.id)} onChange={(ev) => toggle(e.id, ev.target.checked)} />
                        <span>{e.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        }
        footer={<ModalFooter onCancel={onCancel} isDarkMode={isDarkMode} primaryDisabled={(pii.entities?.length ?? 0) === 0} onPrimary={onSave} />}
      />
    );
  }

  if (modal === 'moderation') {
    const cats = new Set(mod.categories);
    const setCats = (next: Set<string>) => setWk((prev) => ({ ...prev, moderation: { ...mod, categories: [...next] } }));
    const toggle = (id: string, on: boolean) => {
      const n = new Set(cats);
      if (on) n.add(id);
      else n.delete(id);
      setCats(n);
    };
    const ids = MODERATION_CATEGORIES.map((c) => c.id);
    const allSel = ids.every((i) => cats.has(i));
    const groups = [...new Set(MODERATION_CATEGORIES.map((c) => c.group || 'Categories'))];

    return (
      <ModalScrollShell
        scroll={
          <>
            <div className="flex flex-wrap items-center gap-2 pb-3">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <input type="checkbox" className="rounded border-slate-400" checked={allSel} onChange={() => setCats(allSel ? new Set() : new Set(ids))} />
                Select all categories
              </label>
              <button type="button" className="rounded-full border px-2.5 py-1 text-[10px] font-semibold" onClick={() => setCats(new Set(ids))}>
                All Categories
              </button>
              <button type="button" className="rounded-full border px-2.5 py-1 text-[10px] font-semibold" onClick={() => setCats(new Set(moderationCriticalSet))}>
                Most Critical
              </button>
              <button type="button" className="text-[10px] font-semibold" onClick={() => setCats(new Set())}>
                Clear
              </button>
            </div>
            <div className="space-y-4 pr-1">
              {groups.map((gLabel) => {
                const subs = MODERATION_CATEGORIES.filter((c) => (c.group || 'Categories') === gLabel);
                if (!subs.length) return null;
                return (
                  <div key={gLabel}>
                    <p className={`mb-2 text-[10px] font-bold uppercase tracking-wide ${lb}`}>{gLabel}</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      {subs.map((c) => (
                        <label key={c.id} className={`cursor-pointer rounded-lg border p-2 ${isDarkMode ? 'border-slate-700 hover:bg-slate-900/50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <div className="flex gap-2">
                            <input type="checkbox" checked={cats.has(c.id)} onChange={(ev) => toggle(c.id, ev.target.checked)} className="mt-1 rounded border-slate-400" />
                            <div className="min-w-0">
                              <div className="text-xs font-bold">{c.label}</div>
                              <div className={`mt-0.5 text-[11px] ${lb}`}>{c.description}</div>
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        }
        footer={<ModalFooter primaryDisabled={mod.categories.length === 0} onCancel={onCancel} isDarkMode={isDarkMode} onPrimary={onSave} />}
      />
    );
  }

  if (modal === 'jailbreak' || modal === 'nsfw' || modal === 'promptInjection') {
    const b = modal === 'jailbreak' ? jb : modal === 'nsfw' ? ns : pi;
    const patch = (p: Partial<typeof b>) =>
      modal === 'jailbreak'
        ? setWk((prev) => ({ ...prev, jailbreak: { ...b, ...p } }))
        : modal === 'nsfw'
          ? setWk((prev) => ({ ...prev, nsfw: { ...b, ...p } }))
          : setWk((prev) => ({ ...prev, promptInjection: { ...b, ...p } }));

    return (
      <ModalScrollShell
        scroll={
          <div className="space-y-4">
            <label className={`block ${lb}`}>
              <span className="mb-1 block font-semibold">Model</span>
              <select value={b.model} onChange={(e) => patch({ model: e.target.value })} className={ic}>
                {GUARDRAIL_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>Confidence threshold</span>
                <span>{Math.round(b.confidence)}%</span>
              </div>
              <input type="range" min={5} max={100} value={b.confidence} onChange={(e) => patch({ confidence: Number(e.target.value) })} className="w-full accent-rose-600" />
              <p className={`mt-1 text-[11px] ${lb}`}>Minimum confidence score to trigger tripwire for the guardrail.</p>
            </div>
          </div>
        }
        footer={<ModalFooter primaryLabel={modal === 'nsfw' ? 'Save' : 'Add'} onCancel={onCancel} isDarkMode={isDarkMode} onPrimary={onSave} />}
      />
    );
  }

  if (modal === 'hallucination') {
    const patch = (p: Partial<typeof hall>) => setWk((prev) => ({ ...prev, hallucination: { ...hall, ...p } }));
    return (
      <ModalScrollShell
        scroll={
          <div className="space-y-4">
            <label className={`block ${lb}`}>
              <span className="mb-1 block font-semibold">Vector store</span>
              <input value={hall.vectorStoreId} onChange={(e) => patch({ vectorStoreId: e.target.value })} placeholder="Enter vector store id" className={ic} />
            </label>
            <button
              type="button"
              onClick={() => window.open('https://platform.openai.com/docs/guides/vector-stores', '_blank')}
              className={`text-xs font-semibold ${isDarkMode ? 'text-sky-400' : 'text-sky-700'}`}
            >
              Browse vector stores ↗
            </button>
            <label className={`block ${lb}`}>
              <span className="mb-1 block font-semibold">Model</span>
              <select value={hall.model} onChange={(e) => patch({ model: e.target.value })} className={ic}>
                {GUARDRAIL_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>Confidence threshold</span>
                <span>{Math.round(hall.confidence)}%</span>
              </div>
              <input type="range" min={5} max={100} value={hall.confidence} onChange={(e) => patch({ confidence: Number(e.target.value) })} className="w-full accent-rose-600" />
              <p className={`mt-1 text-[11px] ${lb}`}>Minimum confidence score to trigger tripwire for the guardrail.</p>
            </div>
          </div>
        }
        footer={<ModalFooter primaryDisabled={!String(hall.vectorStoreId || '').trim()} onCancel={onCancel} isDarkMode={isDarkMode} onPrimary={onSave} />}
      />
    );
  }

  if (modal === 'urlFilter') {
    const patch = (p: Partial<typeof uf>) => setWk((prev) => ({ ...prev, urlFilter: { ...uf, ...p } }));
    return (
      <ModalScrollShell
        scroll={
          <div className="space-y-4">
            <div>
              <p className="mb-1 text-xs font-semibold">URL allow list</p>
              <div className="flex gap-2">
                <input
                  value={draftUrlAllow}
                  onChange={(e) => setDraftUrlAllow(e.target.value)}
                  placeholder="example.com"
                  className={ic}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const t = draftUrlAllow.trim();
                      if (t) patch({ allowList: [...uf.allowList, t] });
                      setDraftUrlAllow('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const t = draftUrlAllow.trim();
                    if (t) patch({ allowList: [...uf.allowList, t] });
                    setDraftUrlAllow('');
                  }}
                  className={`shrink-0 rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-600' : 'border-slate-300'}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className={`mt-1 text-[11px] ${lb}`}>Add domains, IP addresses, or CIDR ranges to allow.</p>
              <ul className="mt-2 flex flex-wrap gap-1">
                {uf.allowList.map((x) => (
                  <li key={x} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                    {x}
                    <button type="button" aria-label={`remove ${x}`} onClick={() => patch({ allowList: uf.allowList.filter((a) => a !== x) })} className="text-slate-500">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold">Allowed schemes</p>
              <div className="flex gap-2">
                <input
                  value={draftScheme}
                  onChange={(e) => setDraftScheme(e.target.value)}
                  placeholder="https"
                  className={ic}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const s = draftScheme.trim();
                      if (s && !uf.schemes.includes(s)) patch({ schemes: [...uf.schemes, s] });
                      setDraftScheme('');
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    const s = draftScheme.trim();
                    if (s && !uf.schemes.includes(s)) patch({ schemes: [...uf.schemes, s] });
                    setDraftScheme('');
                  }}
                  className={`shrink-0 rounded-lg border px-3 py-2 ${isDarkMode ? 'border-slate-600' : 'border-slate-300'}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              <p className={`mt-1 text-[11px] ${lb}`}>Only URLs using the listed schemes will be allowed.</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {uf.schemes.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                    {s}
                    <button type="button" aria-label={`remove ${s}`} onClick={() => patch({ schemes: uf.schemes.filter((sc) => sc !== s) })} className="text-slate-500">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <div className={`rounded-lg border p-3 dark:border-slate-700 ${isDarkMode ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold">Block user info</div>
                  <div className={`mt-0.5 text-[11px] ${lb}`}>Reject URLs containing username or password segments.</div>
                </div>
                <SwitchToggleMini checked={uf.blockUserInfo} onChange={(v) => patch({ blockUserInfo: v })} isDarkMode={isDarkMode} />
              </div>
            </div>
            <div className={`rounded-lg border p-3 dark:border-slate-700 ${isDarkMode ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold">Allow subdomains</div>
                  <div className={`mt-0.5 text-[11px] ${lb}`}>When enabled, subdomains of allowed domains will be permitted.</div>
                </div>
                <SwitchToggleMini checked={uf.allowSubdomains} onChange={(v) => patch({ allowSubdomains: v })} isDarkMode={isDarkMode} />
              </div>
            </div>
          </div>
        }
        footer={<ModalFooter onCancel={onCancel} isDarkMode={isDarkMode} onPrimary={onSave} />}
      />
    );
  }

  if (modal === 'customPrompt') {
    const patch = (p: Partial<typeof cp>) => setWk((prev) => ({ ...prev, customPrompt: { ...cp, ...p } }));
    const max = 4000;
    const len = cp.prompt?.length ?? 0;
    return (
      <ModalScrollShell
        scroll={
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex justify-between gap-2">
                <span className="text-xs font-semibold">System prompt details</span>
                <span className={`text-[11px] ${lb}`}>
                  {len}/{max}
                </span>
              </div>
              <textarea value={cp.prompt} rows={8} maxLength={max} onChange={(e) => patch({ prompt: e.target.value.slice(0, max) })} className={`${ic} resize-y font-mono text-[11px]`} />
              <p className={`mt-1 text-[11px] ${lb}`}>Required. The model uses this prompt to decide whether to trigger the guardrail (maximum {max} characters).</p>
            </div>
            <label className={`block ${lb}`}>
              <span className="mb-1 block font-semibold">Model</span>
              <select value={cp.model} onChange={(e) => patch({ model: e.target.value })} className={ic}>
                {GUARDRAIL_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <div className="mb-1 flex justify-between text-xs font-semibold">
                <span>Confidence threshold</span>
                <span>{Math.round(cp.confidence)}%</span>
              </div>
              <input type="range" min={5} max={100} value={cp.confidence} onChange={(e) => patch({ confidence: Number(e.target.value) })} className="w-full accent-rose-600" />
              <p className={`mt-1 text-[11px] ${lb}`}>Minimum confidence score to trigger tripwire for the guardrail.</p>
            </div>
          </div>
        }
        footer={<ModalFooter primaryDisabled={!cp.prompt?.trim()} onCancel={onCancel} isDarkMode={isDarkMode} onPrimary={onSave} primaryLabel="Add" />}
      />
    );
  }

  return null;
}
