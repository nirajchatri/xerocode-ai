import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Save, Shield, Trash2 } from 'lucide-react';
import type { ModerationCategoryDef, PiiEntityDef } from '../agentStudio/guardrailsCatalog';
import type { WorkspaceGuardrailsCatalogV1 } from './guardrailsWorkspaceCatalogDefaults';
import { normalizeWorkspaceGuardrailsCatalog, createDefaultWorkspaceGuardrailsCatalog } from './guardrailsWorkspaceCatalogDefaults';
import { useGuardrailsCatalog } from './GuardrailsCatalogContext';

function deepCloneCatalog(c: WorkspaceGuardrailsCatalogV1): WorkspaceGuardrailsCatalogV1 {
  return normalizeWorkspaceGuardrailsCatalog(c);
}

function slugId(raw: string, taken: Set<string>): string {
  let base =
    raw
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 48) || 'item';
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n += 1;
  return `${base}_${n}`;
}

type TabId = 'pii' | 'moderation' | 'critical' | 'models';

export const GuardrailsSettingsScreen: React.FC<{
  isDarkMode: boolean;
  onBack: () => void;
}> = ({ isDarkMode, onBack }) => {
  const { catalog, loading, ready, saveCatalog, resetToWorkspaceDefaults } = useGuardrailsCatalog();
  const [tab, setTab] = useState<TabId>('pii');
  const [draft, setDraft] = useState<WorkspaceGuardrailsCatalogV1>(() => deepCloneCatalog(catalog));
  const [saving, setSaving] = useState(false);
  const [localMsg, setLocalMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    setDraft(deepCloneCatalog(catalog));
  }, [ready, catalog]);

  const border = isDarkMode ? 'border-slate-800' : 'border-slate-200';
  const card = `${border} rounded-xl border p-4 ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`;
  const inp = `w-full rounded-lg border px-2.5 py-2 text-xs outline-none ${
    isDarkMode ? 'border-slate-700 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-900'
  }`;
  const label = isDarkMode ? 'text-slate-400' : 'text-slate-600';

  const validateDraft = useCallback((): string | null => {
    const seen = new Set<string>();
    for (const g of draft.piiRegionGroups) {
      for (const e of g.entities) {
        if (!e.id?.trim()) return 'Every PII entity needs an id.';
        if (seen.has(e.id)) return `Duplicate PII entity id: ${e.id}`;
        seen.add(e.id);
      }
    }
    const mid = new Set<string>();
    for (const c of draft.moderationCategories) {
      if (!c.id?.trim()) return 'Every moderation category needs an id.';
      if (mid.has(c.id)) return `Duplicate moderation id: ${c.id}`;
      mid.add(c.id);
    }
    for (const id of draft.moderationCriticalIds) {
      if (!mid.has(id)) return `Critical preset references unknown moderation id: ${id}`;
    }
    if (!draft.guardrailModelOptions.some((m) => m.trim())) {
      return 'Add at least one guardrail model option.';
    }
    return null;
  }, [draft]);

  const persist = async () => {
    setLocalMsg(null);
    const err = validateDraft();
    if (err) {
      setLocalMsg(err);
      return;
    }
    const normalized = normalizeWorkspaceGuardrailsCatalog({ ...draft, version: 1 });
    setSaving(true);
    const ok = await saveCatalog(normalized);
    setSaving(false);
    if (ok) setLocalMsg('Saved to workspace database.');
    else setLocalMsg('Save failed.');
  };

  /** PII */
  const addRegion = () => {
    const allIds = draft.piiRegionGroups.flatMap((g) => g.entities.map((e) => e.id));
    const taken = new Set(allIds);
    const rid = slugId(`region_${draft.piiRegionGroups.length + 1}`, taken);
    setDraft((d) => ({
      ...d,
      piiRegionGroups: [...d.piiRegionGroups, { region: `New region ${d.piiRegionGroups.length + 1}`, entities: [{ id: rid, label: 'New entity' }] }],
    }));
  };

  const removeRegion = (idx: number) => {
    setDraft((d) => ({ ...d, piiRegionGroups: d.piiRegionGroups.filter((_, i) => i !== idx) }));
  };

  const renameRegion = (idx: number, region: string) => {
    setDraft((d) => ({
      ...d,
      piiRegionGroups: d.piiRegionGroups.map((g, i) => (i === idx ? { ...g, region } : g)),
    }));
  };

  const addEntity = (gIdx: number) => {
    setDraft((d) => {
      const taken = new Set(d.piiRegionGroups.flatMap((g) => g.entities.map((e) => e.id)));
      const id = slugId(`entity_${d.piiRegionGroups[gIdx]?.entities.length ?? 0}`, taken);
      const groups = d.piiRegionGroups.map((g, i) =>
        i === gIdx ? { ...g, entities: [...g.entities, { id, label: 'New entity' }] } : g
      );
      return { ...d, piiRegionGroups: groups };
    });
  };

  const patchEntity = (gIdx: number, eIdx: number, p: Partial<PiiEntityDef>) => {
    setDraft((d) => {
      const groups = d.piiRegionGroups.map((g, gi) => {
        if (gi !== gIdx) return g;
        const entities = g.entities.map((e, ei) => (ei === eIdx ? { ...e, ...p } : e));
        return { ...g, entities };
      });
      return { ...d, piiRegionGroups: groups };
    });
  };

  const removeEntity = (gIdx: number, eIdx: number) => {
    setDraft((d) => {
      const groups = d.piiRegionGroups.map((g, gi) =>
        gi === gIdx ? { ...g, entities: g.entities.filter((_, ei) => ei !== eIdx) } : g
      );
      return { ...d, piiRegionGroups: groups };
    });
  };

  /** Moderation */
  const addCategory = () => {
    const taken = new Set(draft.moderationCategories.map((c) => c.id));
    const id = slugId(`category_${draft.moderationCategories.length}`, taken);
    setDraft((d) => ({
      ...d,
      moderationCategories: [
        ...d.moderationCategories,
        { id, label: id, description: '', group: 'Custom' },
      ],
    }));
  };

  const patchCategory = (idx: number, p: Partial<ModerationCategoryDef>) => {
    setDraft((d) => ({
      ...d,
      moderationCategories: d.moderationCategories.map((c, i) => (i === idx ? { ...c, ...p } : c)),
    }));
  };

  const removeCategory = (idx: number) => {
    setDraft((d) => {
      const removed = d.moderationCategories[idx];
      const nextCats = d.moderationCategories.filter((_, i) => i !== idx);
      const critical = d.moderationCriticalIds.filter((id) => id !== removed?.id);
      return { ...d, moderationCategories: nextCats, moderationCriticalIds: critical };
    });
  };

  const toggleCritical = (id: string) => {
    setDraft((d) => {
      const on = new Set(d.moderationCriticalIds);
      if (on.has(id)) on.delete(id);
      else on.add(id);
      return { ...d, moderationCriticalIds: [...on] };
    });
  };

  const tabs: ReadonlyArray<{ id: TabId; label: string }> = [
    { id: 'pii', label: 'PII entities' },
    { id: 'moderation', label: 'Moderation' },
    { id: 'critical', label: 'Critical preset' },
    { id: 'models', label: 'Guardrail models' },
  ];

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className={card}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500 text-white">
              <Shield className="h-4 w-4" />
            </span>
            <div>
              <h2 className={`text-xl font-semibold ${isDarkMode ? 'text-slate-100' : 'text-slate-900'}`}>Guardrails Settings</h2>
              <p className={`text-sm ${label}`}>Master catalog used by Agent Studio guardrail nodes — add, edit, and delete options. Stored per workspace.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                resetToWorkspaceDefaults();
                setDraft(createDefaultWorkspaceGuardrailsCatalog());
                setLocalMsg('Reverted draft to seeded defaults — click Save to write to database.');
              }}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isDarkMode ? 'border-slate-600 text-slate-200' : 'border-slate-300'}`}
            >
              Reset draft
            </button>
            <button
              type="button"
              onClick={onBack}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold ${isDarkMode ? 'border-slate-600 text-slate-200' : 'border-slate-300'}`}
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving || loading || !ready}
              onClick={() => void persist()}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-45 dark:bg-white dark:text-slate-900"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save to database
            </button>
          </div>
        </div>

        {!ready || loading ? (
          <div className={`flex items-center gap-2 text-sm ${label}`}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading catalog…
          </div>
        ) : (
          <>
            <div className={`mb-4 flex flex-wrap gap-1 border-b pb-3 ${border}`}>
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    tab === t.id ? (isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-900 text-white') : isDarkMode ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {localMsg && <p className={`mb-3 text-sm ${localMsg.includes('Saved') ? (isDarkMode ? 'text-emerald-400' : 'text-emerald-700') : isDarkMode ? 'text-amber-400' : 'text-amber-700'}`}>{localMsg}</p>}

            {tab === 'pii' && (
              <div className="space-y-6">
                <div className="flex justify-end">
                  <button type="button" onClick={addRegion} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${border}`}>
                    <Plus className="h-3.5 w-3.5" />
                    Add region
                  </button>
                </div>
                {draft.piiRegionGroups.map((g, gi) => (
                  <div key={`${g.region}-${gi}`} className={`rounded-xl border p-4 ${border}`}>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <label className={`block flex-1 min-w-[12rem] text-xs font-semibold uppercase tracking-wide ${label}`}>
                        Region
                        <input value={g.region} onChange={(e) => renameRegion(gi, e.target.value)} className={`mt-1 ${inp}`} />
                      </label>
                      <button type="button" onClick={() => removeRegion(gi)} className={`mt-5 inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold text-rose-600 ${border}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete region
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-xs">
                        <thead>
                          <tr className={label}>
                            <th className="py-2 pr-2">Id</th>
                            <th className="py-2 pr-2">Label</th>
                            <th className="w-12 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {g.entities.map((e, ei) => (
                            <tr key={`${gi}-${ei}-${e.id}`} className="border-t border-slate-200/50 dark:border-slate-700/70">
                              <td className="py-2 pr-2 align-top">
                                <input value={e.id} onChange={(ev) => patchEntity(gi, ei, { id: ev.target.value.trim() })} className={inp} />
                              </td>
                              <td className="py-2 pr-2 align-top">
                                <input value={e.label} onChange={(ev) => patchEntity(gi, ei, { label: ev.target.value })} className={inp} />
                              </td>
                              <td className="py-2 align-top">
                                <button type="button" title="Remove" aria-label="Remove entity" className="text-slate-500 hover:text-rose-600" onClick={() => removeEntity(gi, ei)}>
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                          </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" onClick={() => addEntity(gi)} className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${isDarkMode ? 'text-sky-400' : 'text-sky-700'}`}>
                      <Plus className="h-3.5 w-3.5" />
                      Add entity
                    </button>
                  </div>
                ))}
              </div>
            )}

            {tab === 'moderation' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button type="button" onClick={addCategory} className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold ${border}`}>
                    <Plus className="h-3.5 w-3.5" />
                    Add category
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-xs">
                    <thead>
                      <tr className={label}>
                        <th className="py-2 pr-2">Id</th>
                        <th className="py-2 pr-2">Label</th>
                        <th className="py-2 pr-2">Description</th>
                        <th className="py-2 pr-2">Group</th>
                        <th className="w-10 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.moderationCategories.map((c, ci) => (
                        <tr key={`${c.id}-${ci}`} className="border-t border-slate-200/50 dark:border-slate-700/70 align-top">
                          <td className="py-2 pr-2">
                            <input value={c.id} onChange={(e) => patchCategory(ci, { id: e.target.value.trim().replace(/\s+/g, '_') })} className={inp} />
                          </td>
                          <td className="py-2 pr-2">
                            <input value={c.label} onChange={(e) => patchCategory(ci, { label: e.target.value })} className={inp} />
                          </td>
                          <td className="py-2 pr-2">
                            <textarea value={c.description} rows={2} onChange={(e) => patchCategory(ci, { description: e.target.value })} className={`${inp} resize-y`} />
                          </td>
                          <td className="py-2 pr-2">
                            <input value={c.group || ''} onChange={(e) => patchCategory(ci, { group: e.target.value })} placeholder="Group" className={inp} />
                          </td>
                          <td className="py-2">
                            <button type="button" className="text-slate-500 hover:text-rose-600" onClick={() => removeCategory(ci)}>
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {tab === 'critical' && (
              <div className="space-y-2">
                <p className={`text-sm ${label}`}>Category ids included when users click “Most Critical” in the moderation guardrail modal.</p>
                <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
                  {draft.moderationCategories.map((c) => (
                    <label key={c.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-xs ${border}`}>
                      <input type="checkbox" checked={draft.moderationCriticalIds.includes(c.id)} onChange={() => toggleCritical(c.id)} className="mt-0.5" />
                      <span>
                        <span className="font-bold">{c.label}</span>
                        <span className={`mt-0.5 block text-[11px] ${label}`}>{c.id}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tab === 'models' && (
              <div>
                <p className={`mb-2 text-sm ${label}`}>One model id per line. Populates guardrail model dropdowns (jailbreak, NSFW, etc.).</p>
                <textarea
                  value={draft.guardrailModelOptions.join('\n')}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      guardrailModelOptions: e.target.value
                        .split(/\r?\n/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }))
                  }
                  rows={12}
                  className={`${inp} font-mono resize-y`}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
