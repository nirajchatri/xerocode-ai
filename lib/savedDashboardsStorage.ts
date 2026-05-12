import type { DashboardBuildContext } from '../components/AiStudioLanding';

const STORAGE_KEY = 'xerocode_ai.savedDashboards.v1';

function readStorageRaw(): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  return localStorage.getItem(STORAGE_KEY);
}

export type SavedDashboardPanelId =
  | 'kpis'
  | 'trend'
  | 'category'
  | 'histogram'
  | 'secondary'
  | 'comparison'
  | 'dataTable';

export type SavedDashboardRecord = {
  id: string;
  name: string;
  savedAt: number;
  buildContext: DashboardBuildContext;
  dismissedPanelIds: SavedDashboardPanelId[];
};

function safeParse(raw: string | null): SavedDashboardRecord[] {
  if (!raw) {
    return [];
  }
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) {
      return [];
    }
    return v.filter(
      (x): x is SavedDashboardRecord =>
        typeof x === 'object' &&
        x !== null &&
        typeof (x as SavedDashboardRecord).id === 'string' &&
        typeof (x as SavedDashboardRecord).name === 'string' &&
        typeof (x as SavedDashboardRecord).savedAt === 'number' &&
        typeof (x as SavedDashboardRecord).buildContext === 'object'
    );
  } catch {
    return [];
  }
}

export function listSavedDashboards(): SavedDashboardRecord[] {
  if (typeof localStorage === 'undefined') {
    return [];
  }
  return safeParse(readStorageRaw()).sort((a, b) => b.savedAt - a.savedAt);
}

export function addSavedDashboard(
  entry: Omit<SavedDashboardRecord, 'id' | 'savedAt'>
): { ok: true; id: string } | { ok: false; error: string } {
  if (typeof localStorage === 'undefined') {
    return { ok: false, error: 'Storage is not available in this environment.' };
  }
  const id = `sv-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const full: SavedDashboardRecord = { ...entry, id, savedAt: Date.now() };
  const list = safeParse(readStorageRaw());
  const next = [full, ...list];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return { ok: true, id };
  } catch {
    return { ok: false, error: 'Could not save (browser storage may be full or disabled).' };
  }
}

export function deleteSavedDashboard(id: string): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const list = safeParse(readStorageRaw());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((x) => x.id !== id)));
}
