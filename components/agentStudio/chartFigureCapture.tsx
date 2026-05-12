import { createRoot, type Root } from 'react-dom/client';
import { toPng } from 'html-to-image';
import html2canvas from 'html2canvas';
import React from 'react';

import { chartJsonToPngDataUrl } from './chartJsonCanvasPng';
import { WorkflowChartFigure } from './WorkflowChatMessageBody';

/** Off-screen but fully opaque — opacity 0 breaks many rasterizers; -9999px gives 0×0 rects for SVG in some engines. */
const HOST_STYLE =
  'position:fixed;left:0;top:0;width:720px;height:440px;overflow:hidden;' +
  'transform:translateX(-125vw);opacity:1;visibility:visible;' +
  'pointer-events:none;z-index:2147483646;background:#ffffff;box-sizing:border-box;padding:12px';

function svgIntrinsicSize(svg: SVGSVGElement): { w: number; h: number } {
  const vb = svg.viewBox?.baseVal;
  if (vb && vb.width > 0 && vb.height > 0) {
    return { w: vb.width, h: vb.height };
  }
  const wa = parseFloat(String(svg.getAttribute('width') || '').replace(/px/i, ''));
  const ha = parseFloat(String(svg.getAttribute('height') || '').replace(/px/i, ''));
  if (Number.isFinite(wa) && wa > 0 && Number.isFinite(ha) && ha > 0) {
    return { w: wa, h: ha };
  }
  const r = svg.getBoundingClientRect();
  const w = r.width > 8 ? r.width : 696;
  const h = r.height > 8 ? r.height : 340;
  return { w, h };
}

/** Last resort: rasterize the Recharts SVG directly (avoids html2canvas SVG gaps). */
async function rasterizeSvgFromHost(host: HTMLElement): Promise<string | null> {
  const svg = host.querySelector('svg');
  if (!svg) return null;

  const { w: iw, h: ih } = svgIntrinsicSize(svg as SVGSVGElement);
  const w = Math.min(Math.max(iw, 320), 1400);
  const h = Math.min(Math.max(ih, 240), 1200);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  if (!clone.getAttribute('viewBox') && (svg as SVGSVGElement).viewBox?.baseVal) {
    const v = (svg as SVGSVGElement).viewBox.baseVal;
    clone.setAttribute('viewBox', `${v.x} ${v.y} ${v.width} ${v.height}`);
  }

  const svgText = new XMLSerializer().serializeToString(clone);
  const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
  const objUrl = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('svg'));
      img.src = objUrl;
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * scale);
    canvas.height = Math.ceil(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objUrl);
  }
}

/**
 * PNG for PDF: Canvas draw from chart JSON first (always works in-browser),
 * then DOM screenshot fallbacks for edge cases.
 */
export async function captureWorkflowChartPng(raw: string): Promise<string | null> {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const canvasPng = chartJsonToPngDataUrl(trimmed);
  if (canvasPng && /^data:image\/png/i.test(canvasPng) && canvasPng.length > 400) {
    return canvasPng;
  }

  const host = document.createElement('div');
  host.setAttribute('data-pdf-chart-capture', '1');
  host.style.cssText = HOST_STYLE;
  document.body.appendChild(host);

  let root: Root | null = null;
  try {
    root = createRoot(host);
    root.render(<WorkflowChartFigure raw={trimmed} isDarkMode={false} variant="pdf" />);

    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => setTimeout(r, 650));
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

    const tryDataUrl = (u: string | undefined | null): string | null => {
      if (!u || u.length < 80) return null;
      if (/^data:image\/(png|jpeg|jpg|webp)/i.test(u)) return u;
      return null;
    };

    try {
      const png = await toPng(host, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        cacheBust: true,
      });
      const ok = tryDataUrl(png);
      if (ok) return ok;
    } catch {
      /* next */
    }

    for (const fo of [false, true] as const) {
      try {
        const canvas = await html2canvas(host, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: fo,
        });
        const u = canvas.toDataURL('image/png');
        const ok = tryDataUrl(u);
        if (ok) return ok;
      } catch {
        /* next */
      }
    }

    const svgPng = await rasterizeSvgFromHost(host);
    return tryDataUrl(svgPng);
  } finally {
    root?.unmount();
    host.remove();
  }
}
