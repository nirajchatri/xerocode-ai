/**
 * Renders ```chart JSON to a PNG data URL using Canvas 2D only (no DOM/Recharts screenshots).
 * Used for reliable PDF embedding when html2canvas / html-to-image fail.
 */

import { parseAgentChartJson } from './WorkflowChatMessageBody';

const COLORS = ['#7c3aed', '#0891b2', '#059669', '#e11d48', '#d97706', '#4f46e5', '#64748b'];

const W = 720;
const H = 420;
const PAD = { top: 52, right: 28, bottom: 56, left: 56 };

function cartesianMax(series: { data: number[] }[]): number {
  let m = 0;
  for (const s of series) {
    for (const v of s.data) {
      if (Number.isFinite(v)) m = Math.max(m, v);
    }
  }
  return m > 0 ? m : 1;
}

function drawTitle(ctx: CanvasRenderingContext2D, title: string | undefined) {
  if (!title?.trim()) return;
  ctx.save();
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title.trim(), W / 2, 30);
  ctx.restore();
}

function drawCartesian(
  ctx: CanvasRenderingContext2D,
  spec: {
    type: 'bar' | 'line' | 'area';
    labels: string[];
    series: { name: string; data: number[] }[];
    title?: string;
  }
) {
  drawTitle(ctx, spec.title);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const n = spec.labels.length;
  const nSer = spec.series.length;
  const ymax = cartesianMax(spec.series);

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  const ticks = 4;
  ctx.fillStyle = '#64748b';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let t = 0; t <= ticks; t++) {
    const val = (ymax * (ticks - t)) / ticks;
    const y = PAD.top + (plotH * t) / ticks;
    ctx.fillText(String(Number(val.toFixed(val >= 100 ? 0 : val >= 10 ? 1 : 3))), PAD.left - 6, y + 4);
    ctx.strokeStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.moveTo(PAD.left, y);
    ctx.lineTo(PAD.left + plotW, y);
    ctx.stroke();
  }

  const slotW = n > 0 ? plotW / n : plotW;
  const half = slotW * 0.42;

  if (spec.type === 'bar') {
    const bw = half / Math.max(nSer, 1);
    for (let i = 0; i < n; i++) {
      const cx = PAD.left + i * slotW + slotW / 2;
      for (let j = 0; j < nSer; j++) {
        const v = spec.series[j]?.data[i] ?? 0;
        const bh = (Number(v) / ymax) * plotH;
        const x = cx - half / 2 + j * bw;
        const y = PAD.top + plotH - bh;
        ctx.fillStyle = COLORS[j % COLORS.length];
        ctx.fillRect(x, y, Math.max(bw - 1, 2), bh);
      }
    }
  }

  if (spec.type === 'line' || spec.type === 'area') {
    for (let j = 0; j < nSer; j++) {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < n; i++) {
        const v = spec.series[j]?.data[i] ?? 0;
        const x = PAD.left + i * slotW + slotW / 2;
        const y = PAD.top + plotH - (Number(v) / ymax) * plotH;
        pts.push({ x, y });
      }
      if (spec.type === 'area' && pts.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(pts[0]!.x, PAD.top + plotH);
        ctx.lineTo(pts[0]!.x, pts[0]!.y);
        for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y);
        ctx.lineTo(pts[pts.length - 1]!.x, PAD.top + plotH);
        ctx.closePath();
        ctx.fillStyle = `${COLORS[j % COLORS.length]}33`;
        ctx.fill();
      }
      ctx.beginPath();
      ctx.strokeStyle = COLORS[j % COLORS.length];
      ctx.lineWidth = 2;
      if (pts[0]) ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k]!.x, pts[k]!.y);
      ctx.stroke();
      ctx.fillStyle = COLORS[j % COLORS.length];
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.fillStyle = '#475569';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const lab = spec.labels[i] ?? '';
    const short = lab.length > 14 ? `${lab.slice(0, 12)}…` : lab;
    const x = PAD.left + i * slotW + slotW / 2;
    ctx.fillText(short, x, PAD.top + plotH + 18);
  }

  let lx = PAD.left;
  const ly = 14;
  ctx.textAlign = 'left';
  for (let j = 0; j < nSer; j++) {
    ctx.fillStyle = COLORS[j % COLORS.length];
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.font = '10px system-ui, sans-serif';
    const name = spec.series[j]?.name ?? '';
    ctx.fillText(name.slice(0, 24), lx + 14, ly + 9);
    lx += ctx.measureText(name).width + 52;
    if (lx > W - 80 && j < nSer - 1) break;
  }
}

function drawPie(
  ctx: CanvasRenderingContext2D,
  spec: { title?: string; data: { name: string; value: number }[] }
) {
  drawTitle(ctx, spec.title);
  const cx = W * 0.38;
  const cy = H / 2 + 12;
  const r = Math.min(W, H) * 0.26;
  const total = spec.data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  let angle = -Math.PI / 2;
  spec.data.forEach((d, i) => {
    const slice = (Math.max(0, d.value) / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    angle += slice;
  });

  let ly = PAD.top;
  ctx.textAlign = 'left';
  spec.data.forEach((d, i) => {
    ctx.fillStyle = COLORS[i % COLORS.length];
    ctx.fillRect(W - 200, ly, 11, 11);
    ctx.fillStyle = '#334155';
    ctx.font = '11px system-ui, sans-serif';
    const line = `${d.name}: ${d.value}`;
    ctx.fillText(line.slice(0, 36), W - 182, ly + 10);
    ly += 20;
  });
}

function drawScatter(
  ctx: CanvasRenderingContext2D,
  spec: {
    title?: string;
    series: { name: string; x: number[]; y: number[] }[];
  }
) {
  drawTitle(ctx, spec.title);
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const s of spec.series) {
    for (let i = 0; i < s.x.length; i++) {
      xmin = Math.min(xmin, s.x[i]!);
      xmax = Math.max(xmax, s.x[i]!);
      ymin = Math.min(ymin, s.y[i]!);
      ymax = Math.max(ymax, s.y[i]!);
    }
  }
  if (!Number.isFinite(xmin) || xmin === xmax) {
    xmin -= 1;
    xmax += 1;
  }
  if (!Number.isFinite(ymin) || ymin === ymax) {
    ymin -= 1;
    ymax += 1;
  }

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  ctx.strokeStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(PAD.left, PAD.top);
  ctx.lineTo(PAD.left, PAD.top + plotH);
  ctx.lineTo(PAD.left + plotW, PAD.top + plotH);
  ctx.stroke();

  const sx = (x: number) => PAD.left + ((x - xmin) / (xmax - xmin)) * plotW;
  const sy = (y: number) => PAD.top + plotH - ((y - ymin) / (ymax - ymin)) * plotH;

  spec.series.forEach((s, ji) => {
    ctx.fillStyle = COLORS[ji % COLORS.length];
    for (let i = 0; i < s.x.length; i++) {
      ctx.beginPath();
      ctx.arc(sx(s.x[i]!), sy(s.y[i]!), 4, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.fillStyle = '#475569';
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(String(xmin.toFixed(2)), PAD.left, PAD.top + plotH + 22);
  ctx.textAlign = 'right';
  ctx.fillText(String(xmax.toFixed(2)), PAD.left + plotW, PAD.top + plotH + 22);

  let lx = PAD.left;
  const ly = 14;
  spec.series.forEach((s, j) => {
    ctx.fillStyle = COLORS[j % COLORS.length];
    ctx.fillRect(lx, ly, 10, 10);
    ctx.fillStyle = '#334155';
    ctx.fillText(s.name.slice(0, 20), lx + 14, ly + 9);
    lx += 90;
  });
}

/** Returns PNG data URL or null if JSON is not a valid chart spec. */
export function chartJsonToPngDataUrl(raw: string): string | null {
  const parsed = parseAgentChartJson(raw.trim());
  if (!parsed.ok) return null;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const { spec } = parsed;
  if (spec.type === 'pie') {
    drawPie(ctx, spec);
  } else if (spec.type === 'scatter') {
    drawScatter(ctx, spec);
  } else {
    drawCartesian(ctx, spec);
  }

  try {
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}
