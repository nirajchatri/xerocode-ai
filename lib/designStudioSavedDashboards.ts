/** Stored inside `/api/dashboards` `payload` to distinguish Design Studio specs from classic dashboard builder saves. */
export const DESIGN_STUDIO_REMOTE_PAYLOAD_KIND = 'design_studio_proposal' as const;

export type DesignStudioSavedDashboard = {
  id: string;
  name: string;
  savedAt: number;
  proposalJson: string;
  selectedApiKey?: string;
  selectedDatasourceKey?: string;
};

const STORAGE_KEY = 'xerocode_ai_design_studio_saved_dashboards_v1';
const MAX_ENTRIES = 40;

function readRaw(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY);
}

function parseList(raw: string | null): DesignStudioSavedDashboard[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    return v.filter(
      (x): x is DesignStudioSavedDashboard =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as DesignStudioSavedDashboard).id === 'string' &&
        typeof (x as DesignStudioSavedDashboard).name === 'string' &&
        typeof (x as DesignStudioSavedDashboard).savedAt === 'number' &&
        typeof (x as DesignStudioSavedDashboard).proposalJson === 'string'
    );
  } catch {
    return [];
  }
}

export function listDesignStudioSavedDashboards(): DesignStudioSavedDashboard[] {
  return parseList(readRaw()).sort((a, b) => b.savedAt - a.savedAt);
}

export function saveDesignStudioDashboard(payload: {
  name: string;
  proposalJson: string;
  selectedApiKey?: string;
  selectedDatasourceKey?: string;
}): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: false, error: 'Storage is not available.' };
  }
  const name = payload.name.trim() || 'Untitled dashboard';
  const id = `ds-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const entry: DesignStudioSavedDashboard = {
    id,
    name,
    savedAt: Date.now(),
    proposalJson: payload.proposalJson,
    selectedApiKey: payload.selectedApiKey?.trim() || undefined,
    selectedDatasourceKey: payload.selectedDatasourceKey?.trim() || undefined,
  };
  const next = [entry, ...parseList(readRaw())].slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true, id };
  } catch {
    return { ok: false, error: 'Could not save (storage full or disabled).' };
  }
}
