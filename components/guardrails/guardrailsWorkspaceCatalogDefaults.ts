import {
  MODERATION_CATEGORIES as SEED_MODERATION,
  MODERATION_CRITICAL_IDS,
  type ModerationCategoryDef,
  type PiiRegionGroup,
  PII_REGION_GROUPS as SEED_PII_REGIONS,
} from '../agentStudio/guardrailsCatalog';

/** Mirrors `AGENT_MODEL_OPTIONS` for guardrail model dropdowns (agent node has its own list). */
export const DEFAULT_GUARDRAIL_MODEL_OPTIONS: string[] = [
  'gpt-4.1-mini',
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-5',
  'o4-mini',
  'gpt-5-nano',
];

export type WorkspaceGuardrailsCatalogV1 = {
  version: 1;
  piiRegionGroups: PiiRegionGroup[];
  moderationCategories: ModerationCategoryDef[];
  moderationCriticalIds: string[];
  guardrailModelOptions: string[];
};

function clone<T>(x: T): T {
  return typeof structuredClone === 'function' ? structuredClone(x) : (JSON.parse(JSON.stringify(x)) as T);
}

export function createDefaultWorkspaceGuardrailsCatalog(): WorkspaceGuardrailsCatalogV1 {
  return {
    version: 1,
    piiRegionGroups: clone(SEED_PII_REGIONS),
    moderationCategories: clone(SEED_MODERATION),
    moderationCriticalIds: [...MODERATION_CRITICAL_IDS],
    guardrailModelOptions: [...DEFAULT_GUARDRAIL_MODEL_OPTIONS],
  };
}

/** Build a coherent catalog object from arbitrary JSON saved in DB. */
export function normalizeWorkspaceGuardrailsCatalog(raw: unknown): WorkspaceGuardrailsCatalogV1 {
  const defs = createDefaultWorkspaceGuardrailsCatalog();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return defs;
  }
  const o = raw as Record<string, unknown>;
  const piiOk = Array.isArray(o.piiRegionGroups)
    ? o.piiRegionGroups.every(
        (g) =>
          g &&
          typeof g === 'object' &&
          typeof (g as { region?: unknown }).region === 'string' &&
          Array.isArray((g as { entities?: unknown }).entities)
      )
    : false;
  const modOk = Array.isArray(o.moderationCategories)
    ? o.moderationCategories.every(
        (c) =>
          c &&
          typeof c === 'object' &&
          typeof (c as { id?: unknown }).id === 'string' &&
          typeof (c as { label?: unknown }).label === 'string' &&
          typeof (c as { description?: unknown }).description === 'string'
      )
    : false;

  let out = { ...defs };
  if (piiOk) {
    out = { ...out, piiRegionGroups: clone(o.piiRegionGroups) as PiiRegionGroup[] };
  }
  if (modOk) {
    out = { ...out, moderationCategories: clone(o.moderationCategories) as ModerationCategoryDef[] };
  }

  const crit = Array.isArray(o.moderationCriticalIds) ? o.moderationCriticalIds.filter((x) => typeof x === 'string') : null;
  if (crit?.length) {
    out = { ...out, moderationCriticalIds: crit as string[] };
  }

  const models = Array.isArray(o.guardrailModelOptions) ? o.guardrailModelOptions.filter((x) => typeof x === 'string').map((x) => String(x).trim()).filter(Boolean) : null;
  if (models?.length) {
    out = { ...out, guardrailModelOptions: models as string[] };
  }

  const validModIds = new Set(out.moderationCategories.map((c) => c.id));
  out = {
    ...out,
    moderationCriticalIds: out.moderationCriticalIds.filter((id) => validModIds.has(id)),
  };
  return out;
}

export function allPiiEntityIdsFromRegions(groups: PiiRegionGroup[]): string[] {
  return groups.flatMap((g) => g.entities.map((e) => e.id));
}
