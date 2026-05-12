import React, { useEffect, useMemo, useState } from 'react';
import { apiUrl, readApiJson, studioFetch } from '../lib/apiBase';
import { DashboardProposalVisualPreview, type DesignStudioLiveDataset } from './DashboardProposalVisualPreview';

const PUBLISH_LIVE_SNAPSHOT_KEY = '__publish_live_snapshot';

export const PublicDesignStudioPreviewPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [proposal, setProposal] = useState<Record<string, unknown> | null>(null);

  const embed =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('embed') === '1';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await studioFetch(apiUrl(`/api/public/design-studio/${encodeURIComponent(slug)}`));
        const data = await readApiJson<{
          ok?: boolean;
          preview?: { title?: string; proposal?: Record<string, unknown> };
          message?: string;
        }>(res);
        if (!res.ok || !data?.ok || !data.preview?.proposal) {
          throw new Error(data?.message || 'Unable to load preview.');
        }
        if (cancelled) return;
        setTitle(String(data.preview.title || ''));
        const pr = data.preview.proposal;
        setProposal(pr && typeof pr === 'object' && !Array.isArray(pr) ? pr : null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Unable to load preview.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const heading = useMemo(() => title.trim() || 'Dashboard preview', [title]);

  const publishLiveSnapshot = proposal?.[PUBLISH_LIVE_SNAPSHOT_KEY];

  const proposalForPreview = useMemo(() => {
    if (!proposal) return null;
    const { [PUBLISH_LIVE_SNAPSHOT_KEY]: _snap, ...rest } = proposal;
    return rest;
  }, [proposal]);

  const liveDataset = useMemo<DesignStudioLiveDataset | null>(() => {
    const snap = publishLiveSnapshot;
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
    const rowsRaw = (snap as { rows?: unknown }).rows;
    if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) return null;
    const rows = rowsRaw.filter(
      (r): r is Record<string, unknown> => r !== null && typeof r === 'object' && !Array.isArray(r)
    );
    if (!rows.length) return null;
    const sourceLabel =
      typeof (snap as { source_label?: unknown }).source_label === 'string'
        ? String((snap as { source_label: string }).source_label).trim()
        : '';
    return {
      rows,
      loading: false,
      error: null,
      sourceLabel: sourceLabel || undefined,
    };
  }, [publishLiveSnapshot]);

  const footerNote = liveDataset
    ? `Published with ${liveDataset.rows.length} snapshot row${liveDataset.rows.length === 1 ? '' : 's'} from ${liveDataset.sourceLabel || 'your linked API'} · reconnect live data in workspace for updates.`
    : 'Static layout from published JSON · Connect live data in your workspace to ship the real dashboard.';

  if (loading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${embed ? 'bg-slate-50 p-4' : 'bg-slate-100'}`}>
        <p className="text-sm text-slate-600">Loading preview…</p>
      </div>
    );
  }

  if (error || !proposal || !proposalForPreview) {
    return (
      <div className={`flex min-h-screen flex-col items-center justify-center gap-3 ${embed ? 'bg-slate-50 p-6' : 'bg-slate-100 p-8'}`}>
        <p className="text-center text-sm font-medium text-rose-700">{error || 'Preview unavailable.'}</p>
      </div>
    );
  }

  return (
    <div className={embed ? 'min-h-0 bg-slate-50' : 'min-h-screen bg-gradient-to-b from-slate-100 to-slate-200'}>
      {!embed && (
        <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600">Shared preview</p>
              <h1 className="truncate text-lg font-semibold text-slate-900">{heading}</h1>
            </div>
            <p className="text-xs text-slate-500">Design Studio · read-only mock</p>
          </div>
        </header>
      )}

      <main className={`mx-auto max-w-5xl ${embed ? 'px-3 py-3' : 'px-4 py-8'}`}>
        <DashboardProposalVisualPreview
          proposal={proposalForPreview}
          liveDataset={liveDataset}
          isDarkMode={false}
          embed={embed}
        />
      </main>

      {!embed && (
        <footer className="border-t border-slate-200 bg-white/80 py-6 text-center text-xs text-slate-500">
          {footerNote}
        </footer>
      )}
    </div>
  );
};
