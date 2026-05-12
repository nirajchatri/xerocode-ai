import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiUrl, readApiJson, studioFetch } from '../../lib/apiBase';
import {
  allPiiEntityIdsFromRegions,
  createDefaultWorkspaceGuardrailsCatalog,
  normalizeWorkspaceGuardrailsCatalog,
  type WorkspaceGuardrailsCatalogV1,
} from './guardrailsWorkspaceCatalogDefaults';

type Ctx = {
  catalog: WorkspaceGuardrailsCatalogV1;
  /** True after first load attempt (successful or not). */
  ready: boolean;
  loading: boolean;
  errorMessage: string | null;
  allPiiEntityIds: string[];
  moderationCriticalSet: Set<string>;
  refresh: () => Promise<void>;
  saveCatalog: (next: WorkspaceGuardrailsCatalogV1) => Promise<boolean>;
  resetToWorkspaceDefaults: () => void;
};

const GuardrailsCatalogContext = createContext<Ctx | null>(null);

export function useGuardrailsCatalog(): Ctx {
  const v = useContext(GuardrailsCatalogContext);
  if (!v) {
    const defaults = createDefaultWorkspaceGuardrailsCatalog();
    const allPiiEntityIds = allPiiEntityIdsFromRegions(defaults.piiRegionGroups);
    return {
      catalog: defaults,
      ready: true,
      loading: false,
      errorMessage: null,
      allPiiEntityIds,
      moderationCriticalSet: new Set(defaults.moderationCriticalIds),
      refresh: async () => {},
      saveCatalog: async () => false,
      resetToWorkspaceDefaults: () => {},
    };
  }
  return v;
}

export function GuardrailsCatalogProvider({
  getAuthHeaders,
  children,
}: {
  getAuthHeaders: () => Record<string, string>;
  children: React.ReactNode;
}) {
  const [catalog, setCatalog] = useState<WorkspaceGuardrailsCatalogV1>(() => createDefaultWorkspaceGuardrailsCatalog());
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const allPiiEntityIds = useMemo(() => allPiiEntityIdsFromRegions(catalog.piiRegionGroups), [catalog.piiRegionGroups]);

  const moderationCriticalSet = useMemo(() => new Set(catalog.moderationCriticalIds), [catalog.moderationCriticalIds]);

  const refresh = useCallback(async () => {
    setErrorMessage(null);
    setLoading(true);
    try {
      const headers = { ...getAuthHeaders() };
      if (!headers['x-user-email'] && !headers['X-User-Email']) {
        setCatalog(createDefaultWorkspaceGuardrailsCatalog());
        setReady(true);
        return;
      }
      const res = await studioFetch(apiUrl('/api/workspace/guardrails-catalog'), { headers });
      const data = await readApiJson<{ ok?: boolean; catalog?: unknown; message?: string }>(res);
      if (!res.ok || !data?.ok) {
        throw new Error(data?.message || 'Unable to load Guardrails catalog.');
      }
      const norm = normalizeWorkspaceGuardrailsCatalog(data.catalog ?? null);
      setCatalog(norm);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : 'Unable to load Guardrails catalog.');
      setCatalog(createDefaultWorkspaceGuardrailsCatalog());
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveCatalog = useCallback(
    async (next: WorkspaceGuardrailsCatalogV1): Promise<boolean> => {
      setErrorMessage(null);
      try {
        const headers = { 'Content-Type': 'application/json', ...getAuthHeaders() };
        if (!headers['x-user-email'] && !headers['X-User-Email']) {
          setErrorMessage('Sign in required to save Guardrails catalog.');
          return false;
        }
        const body = normalizeWorkspaceGuardrailsCatalog({ ...next, version: 1 });
        const res = await studioFetch(apiUrl('/api/workspace/guardrails-catalog'), {
          method: 'PUT',
          headers,
          body: JSON.stringify({ catalog: body }),
        });
        const data = await readApiJson<{ ok?: boolean; message?: string }>(res);
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || 'Unable to save Guardrails catalog.');
        }
        setCatalog(body);
        return true;
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : 'Unable to save Guardrails catalog.');
        return false;
      }
    },
    [getAuthHeaders]
  );

  const resetToWorkspaceDefaults = useCallback(() => {
    setCatalog(createDefaultWorkspaceGuardrailsCatalog());
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      catalog,
      ready,
      loading,
      errorMessage,
      allPiiEntityIds,
      moderationCriticalSet,
      refresh,
      saveCatalog,
      resetToWorkspaceDefaults,
    }),
    [catalog, ready, loading, errorMessage, allPiiEntityIds, moderationCriticalSet, refresh, saveCatalog, resetToWorkspaceDefaults]
  );

  return <GuardrailsCatalogContext.Provider value={value}>{children}</GuardrailsCatalogContext.Provider>;
}
