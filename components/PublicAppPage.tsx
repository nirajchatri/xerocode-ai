import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl, readApiJson, studioFetch } from '../lib/apiBase';

type PublicPayload = {
  name?: string;
  prompt?: string;
  dataSourceName?: string;
  selectedTables?: string[];
  lastState?: {
    columnsByTable?: Record<string, string[]>;
    rowsByTable?: Record<string, Array<{ __rowId?: string; [key: string]: string }>>;
    dashboards?: Array<{
      id: string;
      name: string;
      webpageSpec?: {
        title: string;
        subtitle: string;
        sections: Array<{ heading: string; description: string; cta?: string }>;
      };
    }>;
    activeDashboardId?: string;
  };
};

type RowRecord = { __rowId: string; [key: string]: string };

export const PublicAppPage: React.FC<{ appId: string }> = ({ appId }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [activeTable, setActiveTable] = useState('');
  const [searchText, setSearchText] = useState('');
  const [webFilters, setWebFilters] = useState<Record<string, string>>({});
  const [seedRows, setSeedRows] = useState<RowRecord[]>([]);
  const [seedColumns, setSeedColumns] = useState<string[]>([]);
  const [resultRows, setResultRows] = useState<RowRecord[]>([]);
  const [resultTotal, setResultTotal] = useState(0);
  const [resultBusy, setResultBusy] = useState(false);
  const [resultError, setResultError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await studioFetch(apiUrl(`/api/public/apps/${encodeURIComponent(appId)}`));
        const data = await readApiJson<{ ok?: boolean; app?: { payload?: PublicPayload }; message?: string }>(res);
        if (!res.ok || !data?.ok || !data?.app?.payload) {
          throw new Error(data?.message || 'Unable to load public webpage.');
        }
        if (cancelled) return;
        const nextPayload = data.app.payload;
        setPayload(nextPayload);
        const tables = Array.isArray(nextPayload.selectedTables) ? nextPayload.selectedTables : [];
        setActiveTable(tables[0] || '');
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load public webpage.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId]);

  const tables = useMemo(
    () => (Array.isArray(payload?.selectedTables) ? payload!.selectedTables!.filter(Boolean) : []),
    [payload]
  );

  useEffect(() => {
    let cancelled = false;
    setSeedRows([]);
    setSeedColumns([]);
    if (!appId || !activeTable) return;
    void (async () => {
      try {
        const qs = new URLSearchParams({ table: activeTable, limit: '500', offset: '0' });
        const res = await studioFetch(apiUrl(`/api/public/apps/${encodeURIComponent(appId)}/table-data?${qs}`));
        const data = await readApiJson<{
          ok?: boolean;
          columns?: Array<{ name?: string }>;
          rows?: string[][];
          total?: number;
          message?: string;
        }>(res);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || 'Unable to load table data.');
        }
        const cols = Array.isArray(data?.columns)
          ? data.columns.map((c) => String(c?.name || '')).filter(Boolean)
          : [];
        const packets = Array.isArray(data?.rows) ? data.rows : [];
        const rows: RowRecord[] = packets.map((row, idx) => {
          const rec: RowRecord = { __rowId: `${activeTable}-seed-${idx}` };
          cols.forEach((c, i) => {
            rec[c] = String(row?.[i] ?? '');
          });
          return rec;
        });
        setSeedColumns(cols);
        setSeedRows(rows);
        setResultTotal(Math.max(0, Number(data?.total ?? 0)));
      } catch {
        // ignore — search effect will surface errors
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appId, activeTable]);

  const columnsForFilters = seedColumns.length > 0 ? seedColumns : payload?.lastState?.columnsByTable?.[activeTable] ?? [];
  const rowsForFilters = seedRows.length > 0
    ? seedRows
    : (payload?.lastState?.rowsByTable?.[activeTable] ?? []).map(
        (r, idx) => ({ __rowId: r.__rowId || `seed-fallback-${idx}`, ...(r as Record<string, string>) }) as RowRecord
      );
  const dashboards = payload?.lastState?.dashboards || [];
  const activeDashboardId = payload?.lastState?.activeDashboardId;
  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId) || dashboards[0];
  const webpageSpec = activeDashboard?.webpageSpec;

  const filterOptionsByCol = useMemo(() => {
    const opts: Record<string, string[]> = {};
    const cols = webpageSpec?.filterColumns || [];
    cols.forEach((col) => {
      opts[col] = Array.from(
        new Set(rowsForFilters.map((r) => String(r[col] ?? '').trim()).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
    });
    return opts;
  }, [webpageSpec?.filterColumns, rowsForFilters]);

  useEffect(() => {
    if (!appId || !activeTable) return;
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const filterMap: Record<string, string> = {};
      const cols = webpageSpec?.filterColumns || [];
      cols.forEach((col) => {
        if (webFilters[col]) filterMap[col] = webFilters[col];
      });
      const qs = new URLSearchParams({ table: activeTable, limit: '200', offset: '0' });
      if (searchText.trim()) qs.set('q', searchText.trim());
      if (Object.keys(filterMap).length > 0) qs.set('filters', JSON.stringify(filterMap));
      setResultBusy(true);
      setResultError('');
      try {
        const res = await studioFetch(apiUrl(`/api/public/apps/${encodeURIComponent(appId)}/table-data?${qs}`));
        const data = await readApiJson<{
          ok?: boolean;
          columns?: Array<{ name?: string }>;
          rows?: string[][];
          total?: number;
          message?: string;
        }>(res);
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          throw new Error(data?.message || 'Unable to query table.');
        }
        const cols = Array.isArray(data?.columns)
          ? data.columns.map((c) => String(c?.name || '')).filter(Boolean)
          : [];
        const packets = Array.isArray(data?.rows) ? data.rows : [];
        const rows: RowRecord[] = packets.map((row, idx) => {
          const rec: RowRecord = { __rowId: `${activeTable}-q-${idx}` };
          cols.forEach((c, i) => {
            rec[c] = String(row?.[i] ?? '');
          });
          return rec;
        });
        setResultRows(rows);
        setResultTotal(Math.max(0, Number(data?.total ?? rows.length)));
      } catch (e) {
        if (!cancelled) {
          setResultError(e instanceof Error ? e.message : 'Unable to query table.');
        }
      } finally {
        if (!cancelled) setResultBusy(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [
    appId,
    activeTable,
    searchText,
    webFilters,
    webpageSpec,
  ]);

  const filteredRows = resultRows;

  const renderCard = (template: string, row: RowRecord) => {
    let html = template;
    for (const [key, value] of Object.entries(row)) {
      if (key === '__rowId' || key === '__match') continue;
      const safeValue = String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      html = html.replace(new RegExp(`{{\\s*${escapedKey}\\s*}}`, 'g'), safeValue);
    }
    html = html.replace(/{{\s*[\w_ -]+\s*}}/g, '');
    return html;
  };

  const toEnglishLabel = (raw: string) =>
    raw
      .replace(/[_\-]+/g, ' ')
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-blue-50 to-teal-50 text-slate-900 font-sans">
      <header className="px-6 py-12 text-center max-w-4xl mx-auto">
        <div className="inline-block rounded-full border border-slate-200 bg-white/50 px-3 py-1 text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-6 backdrop-blur-sm shadow-sm">
          # {payload?.dataSourceName || 'DATA LOCATOR'}
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 mb-4">
          {webpageSpec?.title || payload?.name || 'Find any branch. Decode any IFSC.'}
        </h1>
        <p className="text-sm md:text-base text-slate-500 max-w-2xl mx-auto leading-relaxed">
          {webpageSpec?.subtitle || payload?.prompt || 'Search by IFSC code or bank name, or drill down via cascading filters to fetch full branch address, MICR & contact in seconds.'}
        </p>
      </header>
      <main className="px-4 pb-20 max-w-5xl mx-auto">
        {loading && <p className="text-sm text-slate-500 text-center">Loading webpage…</p>}
        {!loading && error && <p className="text-sm text-rose-600 text-center">{error}</p>}
        {!loading && !error && (
          <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-white p-6 md:p-8">
            <div className="mb-6 flex flex-wrap gap-2">
              {tables.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTable(t)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors ${
                    activeTable === t ? 'border-slate-800 bg-slate-900 text-white shadow-md' : 'border-slate-200 bg-white/50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {activeTable ? (
              <div>
                <div className="mb-8">
                  <div className="relative flex items-center">
                    <div className="absolute left-4 text-slate-400">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder={webpageSpec?.searchPlaceholder || "Search..."}
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-12 pr-32 text-base outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                    />
                    <button className="absolute right-2 top-2 bottom-2 rounded-xl bg-slate-900 px-6 text-xs font-bold tracking-wide text-white hover:bg-slate-800 transition-colors flex items-center gap-2">
                      SEARCH <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
                    </button>
                  </div>

                  {(webpageSpec?.filterColumns || []).length > 0 && (
                    <>
                      <div className="my-8 flex items-center justify-center gap-4">
                        <div className="h-px flex-1 bg-slate-200"></div>
                        <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">OR FILTER CASCADING</span>
                        <div className="h-px flex-1 bg-slate-200"></div>
                      </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    {(webpageSpec?.filterColumns || []).slice(0, 4).map((col) => (
                      <div key={col} className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold tracking-widest text-slate-400 pl-1 uppercase">
                          Select {toEnglishLabel(col)}
                        </label>
                        <div className="relative">
                          <select
                            value={webFilters[col] || ''}
                            onChange={(e) => setWebFilters(prev => ({ ...prev, [col]: e.target.value }))}
                            className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white/50 px-3 text-sm font-medium text-slate-700 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100 transition-all shadow-sm"
                          >
                            <option value="" className="text-slate-400">Choose option</option>
                            {(filterOptionsByCol[col] || []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  </>
                  )}
                </div>
                
                <div className="mb-4 flex items-center justify-between px-2">
                  <p className="text-xs font-semibold text-slate-500">
                    {resultBusy ? 'Querying database…' : `${resultTotal.toLocaleString()} results found`}
                  </p>
                  {resultError && <p className="text-xs text-rose-500">{resultError}</p>}
                </div>

                  <div className="grid grid-cols-1 gap-6">
                    {filteredRows.map((r, idx) => (
                      webpageSpec?.dataCardHtmlTemplate ? (
                        <div
                          key={r.__rowId || String(idx)}
                          dangerouslySetInnerHTML={{ __html: renderCard(webpageSpec.dataCardHtmlTemplate, r) }}
                        />
                      ) : (
                        <div key={r.__rowId || String(idx)} className="rounded-3xl border border-slate-100 bg-white p-6 md:p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)] transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(r).filter(([k]) => k !== '__rowId' && k !== '__match').map(([k, v]) => (
                              <div key={k} className="rounded-2xl border border-slate-100 p-4">
                                <p className="flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-slate-400 uppercase mb-1">
                                  {toEnglishLabel(k) || k}
                                </p>
                                <p className="text-sm font-semibold text-slate-800">{String(v || 'Not Available')}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                    {!resultBusy && filteredRows.length === 0 && (
                    <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-slate-400">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      </div>
                      <p className="text-base font-semibold text-slate-900">No matching results found</p>
                      <p className="mt-1 text-sm text-slate-500">Try adjusting your filters or search query.</p>
                    </div>
                  )}
                </div>

                {webpageSpec?.sections && webpageSpec.sections.length > 0 && (
                  <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
                    {webpageSpec.sections.map((section) => (
                      <div
                        key={`${section.heading}-${section.cta || ''}`}
                        className="rounded-3xl border border-slate-100 bg-white p-8 shadow-[0_4px_20px_rgb(0,0,0,0.03)]"
                      >
                        <h3 className="text-xl font-bold text-slate-900 mb-3">{section.heading}</h3>
                        <p className="text-sm text-slate-600 leading-relaxed mb-6">{section.description}</p>
                        {section.cta ? (
                          <button
                            type="button"
                            className="rounded-xl bg-slate-900 px-6 py-3 text-xs font-bold tracking-wide text-white hover:bg-slate-800 transition-colors shadow-sm"
                          >
                            {section.cta}
                          </button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-100 bg-white p-12 text-center shadow-sm">
                <p className="text-base font-semibold text-slate-900">No data available</p>
                <p className="mt-1 text-sm text-slate-500">No pages were saved in this application.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
};
