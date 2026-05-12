import { jsPDF } from 'jspdf';

import { captureWorkflowChartPng } from './chartFigureCapture';
import { splitMessageWithCharts } from './WorkflowChatMessageBody';

/** Mirrors `ChatMsg` from AgentEndChatModal (avoid circular imports). */
export type ChatMsgRow = { role: 'user' | 'assistant'; text: string };

function stripSimpleMarkdown(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .trim();
}

/** Readable table-style summary of a ```chart JSON block for PDF (no canvas). */
export function summarizeChartJsonForPdf(raw: string): string {
  let j: unknown;
  try {
    j = JSON.parse(raw);
  } catch {
    return 'Chart (invalid JSON)';
  }
  if (!j || typeof j !== 'object') return 'Chart (invalid)';
  const o = j as Record<string, unknown>;
  const ty = String(o.type ?? '').toLowerCase();
  const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : '';

  if (ty === 'pie') {
    const data = o.data;
    if (!Array.isArray(data)) return title ? `Pie chart: ${title}` : 'Pie chart';
    const lines = data.map((row) => {
      if (!row || typeof row !== 'object') return '';
      const r = row as Record<string, unknown>;
      const name = String(r.name ?? '—');
      const val = typeof r.value === 'number' ? r.value : Number(r.value) || 0;
      return `${name}: ${val}`;
    });
    const head = title ? `Graph — Pie: ${title}` : 'Graph — Pie';
    return [head, ...lines].join('\n');
  }

  if (ty === 'scatter') {
    const series = o.series;
    if (!Array.isArray(series)) return title ? `Scatter chart: ${title}` : 'Scatter chart';
    const blocks: string[] = [title ? `Graph — Scatter: ${title}` : 'Graph — Scatter'];
    for (const s of series) {
      if (!s || typeof s !== 'object') continue;
      const rec = s as Record<string, unknown>;
      const name = String(rec.name ?? 'Series');
      const xa = rec.x;
      const ya = rec.y;
      if (!Array.isArray(xa) || !Array.isArray(ya)) continue;
      blocks.push(`Series: ${name}`);
      const n = Math.min(xa.length, ya.length);
      for (let i = 0; i < n; i++) {
        blocks.push(`  (${xa[i]}, ${ya[i]})`);
      }
    }
    return blocks.join('\n');
  }

  if (ty === 'bar' || ty === 'line' || ty === 'area') {
    const labels = o.labels;
    const series = o.series;
    if (!Array.isArray(labels) || !Array.isArray(series)) {
      return title ? `${ty} chart: ${title}` : `${ty} chart`;
    }
    const lab = labels.map((x) => String(x));
    const header = ['Category', ...series.map((s: unknown) => (s && typeof s === 'object' ? String((s as Record<string, unknown>).name ?? '?') : '?'))];
    const rows: string[][] = [];
    for (let i = 0; i < lab.length; i++) {
      const row: string[] = [lab[i] ?? ''];
      for (const s of series) {
        if (!s || typeof s !== 'object') {
          row.push('');
          continue;
        }
        const dataArr = (s as Record<string, unknown>).data;
        const nums = Array.isArray(dataArr) ? dataArr : [];
        const v = nums[i];
        row.push(typeof v === 'number' && Number.isFinite(v) ? String(v) : String(v ?? ''));
      }
      rows.push(row);
    }
    const label = `${ty.charAt(0).toUpperCase()}${ty.slice(1)}`;
    const titleLine = title ? `Graph — ${label}: ${title}` : `Graph — ${label}`;
    const table = [header.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
    return `${titleLine}\n${table}`;
  }

  return `Chart (${ty || 'unknown'})`;
}

function flattenAssistantToInsightsAndCharts(text: string): { insights: string; chartRaws: string[] } {
  const segs = splitMessageWithCharts(text);
  let insights = '';
  const chartRaws: string[] = [];
  for (const seg of segs) {
    if (seg.kind === 'text') insights += seg.value;
    else chartRaws.push(seg.value.trim());
  }
  return { insights: stripSimpleMarkdown(insights), chartRaws };
}

export type ReportExchange = {
  question: string;
  insights: string;
  /** Raw ```chart JSON strings (same as in chat). */
  chartRaws: string[];
};

export function buildAgentChatReport(messages: ChatMsgRow[]): {
  intro: string | null;
  /** Charts from assistant-only preamble (welcome), if any. */
  introChartRaws: string[];
  exchanges: ReportExchange[];
} {
  let i = 0;
  let introPieces = '';
  const introChartRaws: string[] = [];

  while (i < messages.length && messages[i].role === 'assistant') {
    const { insights, chartRaws: crs } = flattenAssistantToInsightsAndCharts(messages[i].text);
    if (insights.trim()) introPieces += (introPieces ? '\n\n' : '') + insights.trim();
    introChartRaws.push(...crs);
    i++;
  }

  const exchanges: ReportExchange[] = [];

  while (i < messages.length) {
    if (messages[i].role !== 'user') {
      i++;
      continue;
    }
    const question = stripSimpleMarkdown(messages[i].text);
    i++;

    let insights = '';
    const chartRaws: string[] = [];

    while (i < messages.length && messages[i].role === 'assistant') {
      const { insights: ins, chartRaws: crs } = flattenAssistantToInsightsAndCharts(messages[i].text);
      if (ins) insights += (insights ? '\n\n' : '') + ins;
      chartRaws.push(...crs);
      i++;
    }

    exchanges.push({ question, insights, chartRaws });
  }

  const intro = introPieces.trim() || null;
  return { intro, introChartRaws, exchanges };
}

function slugFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, '-').replace(/^-|-$/g, '') || 'agent-output';
}

/** Accept PNG / JPEG data URLs from capture libs (some canvas paths emit JPEG). */
function parseImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  if (/^data:image\/jpe?g/i.test(dataUrl)) return 'JPEG';
  return 'PNG';
}

async function loadImageDimsFromDataUrl(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error('decode'));
    img.src = dataUrl;
  });
}

/** Adds a chart image to the PDF; falls back to text summary if capture fails. */
async function addChartToPdf(
  doc: jsPDF,
  raw: string,
  margin: number,
  maxW: number,
  ensureSpace: (mm: number) => void,
  yRef: { y: number },
  captureChart: (rawJson: string) => Promise<string | null>
): Promise<void> {
  const dataUrl = await captureChart(raw);
  if (dataUrl && /^data:image\/(png|jpe?g)/i.test(dataUrl)) {
    try {
      let w: number;
      let h: number;
      try {
        const d = await loadImageDimsFromDataUrl(dataUrl);
        w = d.w;
        h = d.h;
      } catch {
        const props = doc.getImageProperties(dataUrl);
        w = Number(props.width);
        h = Number(props.height);
      }
      if (!Number.isFinite(w) || !Number.isFinite(h) || w < 4 || h < 4) {
        throw new Error('invalid image dimensions');
      }
      const maxH = 115;
      let pdfW = maxW;
      let pdfH = (h * pdfW) / w;
      if (pdfH > maxH) {
        pdfH = maxH;
        pdfW = (w * pdfH) / h;
      }
      ensureSpace(pdfH + 10);
      const yDraw = yRef.y;
      const fmt = parseImageFormat(dataUrl);
      doc.addImage(dataUrl, fmt, margin, yDraw, pdfW, pdfH);
      yRef.y = yDraw + pdfH + 10;
      return;
    } catch {
      /* fall through to text */
    }
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const lines = doc.splitTextToSize(summarizeChartJsonForPdf(raw), maxW);
  const lineH = 10 * 0.52;
  for (const line of lines) {
    ensureSpace(lineH + 1);
    doc.text(line, margin, yRef.y);
    yRef.y += lineH;
  }
  yRef.y += 4;
}

export async function downloadAgentChatPdf(opts: {
  workflowName: string;
  messages: ChatMsgRow[];
  /** Override for tests; default renders Recharts off-screen. */
  captureChart?: (rawJson: string) => Promise<string | null>;
}): Promise<void> {
  const { workflowName, messages } = opts;
  const captureChart = opts.captureChart ?? captureWorkflowChartPng;
  const { intro, introChartRaws, exchanges } = buildAgentChatReport(messages);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const maxW = pageW - margin * 2;
  const yRef = { y: 18 };

  const ensureSpace = (neededMm: number) => {
    const pageH = doc.internal.pageSize.getHeight();
    if (yRef.y + neededMm > pageH - 14) {
      doc.addPage();
      yRef.y = 18;
    }
  };

  const addParagraph = (text: string, fontSize: number, opts?: { bold?: boolean }) => {
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const lineH = fontSize * 0.52;
    for (const line of lines) {
      ensureSpace(lineH + 1);
      doc.text(line, margin, yRef.y);
      yRef.y += lineH;
    }
    yRef.y += 3;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Agent output report', margin, yRef.y);
  yRef.y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Workflow: ${workflowName.trim() || 'Untitled'}`, margin, yRef.y);
  yRef.y += 6;
  doc.setFontSize(10);
  doc.setTextColor(90);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, yRef.y);
  doc.setTextColor(0);
  yRef.y += 12;

  if (intro) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    ensureSpace(8);
    doc.text('Introduction', margin, yRef.y);
    yRef.y += 8;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    addParagraph(intro, 11);
  }

  const introRaws = introChartRaws.filter((r) => r.length > 0);
  if (introRaws.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    ensureSpace(8);
    doc.text(introRaws.length > 1 ? 'Graphs (introduction)' : 'Graph (introduction)', margin, yRef.y);
    yRef.y += 7;
    doc.setFont('helvetica', 'normal');
    for (let c = 0; c < introRaws.length; c++) {
      const raw = introRaws[c]!;
      if (introRaws.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        ensureSpace(6);
        doc.text(`Figure ${c + 1}`, margin, yRef.y);
        yRef.y += 6;
        doc.setFont('helvetica', 'normal');
      }
      await addChartToPdf(doc, raw, margin, maxW, ensureSpace, yRef, captureChart);
    }
  }

  let qIndex = 0;
  for (const ex of exchanges) {
    qIndex += 1;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30);
    const qh = `Q${qIndex}: ${ex.question}`;
    const qhLines = doc.splitTextToSize(qh, maxW);
    const lineH = 13 * 0.52;
    for (const line of qhLines) {
      ensureSpace(lineH + 1);
      doc.text(line, margin, yRef.y);
      yRef.y += lineH;
    }
    doc.setTextColor(0);
    yRef.y += 4;

    if (ex.insights) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      ensureSpace(8);
      doc.text('Insights', margin, yRef.y);
      yRef.y += 7;
      doc.setFont('helvetica', 'normal');
      addParagraph(ex.insights, 11);
    }

    const raws = ex.chartRaws.filter((r) => r.length > 0);
    if (raws.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      ensureSpace(8);
      doc.text(raws.length > 1 ? 'Graphs' : 'Graph', margin, yRef.y);
      yRef.y += 7;
      doc.setFont('helvetica', 'normal');
      for (let c = 0; c < raws.length; c++) {
        const raw = raws[c]!;
        if (raws.length > 1) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          ensureSpace(6);
          doc.text(`Figure ${c + 1}`, margin, yRef.y);
          yRef.y += 6;
          doc.setFont('helvetica', 'normal');
        }
        await addChartToPdf(doc, raw, margin, maxW, ensureSpace, yRef, captureChart);
      }
    }

    if (!ex.insights && raws.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.setTextColor(120);
      addParagraph('(No text reply for this question.)', 10);
      doc.setTextColor(0);
      doc.setFont('helvetica', 'normal');
    }

    yRef.y += 4;
  }

  const fname = `${slugFilename(workflowName)}-${Date.now()}.pdf`;
  doc.save(fname);
}
