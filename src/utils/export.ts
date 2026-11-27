import type { BoardElement, BoardDocument } from '../types';
import {
  elementBounds,
  padBounds,
  wrapText,
  fontStack,
  elementCenter,
} from '../utils/geometry';
import { getCachedImage, preloadImage, sceneToSvg, drawElement } from '../scene/renderer';
import { unionBounds } from '../utils/geometry';

export interface ExportOptions {
  scale: number;
  background: string;
  transparent: boolean;
  padding: number;
  theme: 'dark' | 'light';
  framesOnly?: boolean;
}

export const blankCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(w));
  c.height = Math.max(1, Math.floor(h));
  return c;
};

export async function ensureImages(elements: BoardElement[]) {
  const srcs = elements.filter((e) => e.type === 'image').map((e) => (e as { src: string }).src);
  await Promise.all(srcs.map((s) => preloadImage(s).catch(() => null)));
}

export async function renderToCanvas(
  elements: BoardElement[],
  opts: ExportOptions,
): Promise<{ canvas: HTMLCanvasElement; bounds: { x: number; y: number; width: number; height: number } }> {
  await ensureImages(elements);
  const pad = opts.padding;
  const raw = elements.length
    ? unionBounds(elements.map((e) => padBounds(elementBounds(e), 4)))
    : { x: 0, y: 0, width: 800, height: 500 };
  const bounds = padBounds(raw, pad);
  const scale = opts.scale;
  const canvas = blankCanvas(bounds.width * scale, bounds.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no ctx');
  if (!opts.transparent) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.setTransform(scale, 0, 0, scale, -bounds.x * scale, -bounds.y * scale);
  const ordered = [...elements].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  for (const el of ordered) {
    if (el.type === 'frame') continue;
    drawElement(ctx, el, { theme: opts.theme, selectionColor: '#6d5efc' });
  }
  return { canvas, bounds };
}

export async function exportPNG(elements: BoardElement[], opts: ExportOptions): Promise<Blob> {
  const { canvas } = await renderToCanvas(elements, opts);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ?? new Blob()), 'image/png', 1);
  });
}

export function exportSVG(elements: BoardElement[], background: string, padding: number): string {
  const raw = elements.length
    ? unionBounds(elements.map((e) => elementBounds(e)))
    : { x: 0, y: 0, width: 800, height: 500 };
  return sceneToSvg(
    elements.filter((e) => e.type !== 'frame'),
    raw,
    background,
    padding,
  );
}

// jsPDF renders SVG using its own parser, which mangles rough strokes; instead
// we rasterise at high DPI inside a page-fitting PDF so fidelity is guaranteed.
export async function exportPDF(
  elements: BoardElement[],
  opts: ExportOptions,
  meta: { name: string },
): Promise<Blob> {
  const { canvas, bounds } = await renderToCanvas(elements, { ...opts, scale: Math.max(opts.scale, 2) });
  const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
  const { default: jsPDF } = await import('jspdf');
  const landscape = bounds.width >= bounds.height;
  const pdf = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const availW = pageW - margin * 2;
  const availH = pageH - margin * 2;
  const ratio = Math.min(availW / bounds.width, availH / bounds.height);
  const w = bounds.width * ratio;
  const h = bounds.height * ratio;
  pdf.setProperties({ title: meta.name, creator: 'CollabBoard' });
  pdf.addImage(dataUrl, 'JPEG', (pageW - w) / 2, (pageH - h) / 2, w, h);
  return pdf.output('blob');
}

export async function exportPPTX(
  elements: BoardElement[],
  opts: ExportOptions,
  meta: { name: string },
): Promise<Blob> {
  const { default: PptxGenJS } = await import('pptxgenjs');
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_16x9';
  pptx.author = 'CollabBoard';
  pptx.title = meta.name;

  const frames = elements.filter((e) => e.type === 'frame').sort((a, b) => a.index - b.index);
  const groups: { name: string; items: BoardElement[] }[] = [];

  if (frames.length) {
    frames.forEach((f, i) => {
      const fb = elementBounds(f);
      const inside = elements.filter((e) => {
        if (e.id === f.id || e.type === 'frame') return false;
        const c = elementCenter(e);
        return c.x >= fb.x && c.x <= fb.x + fb.width && c.y >= fb.y && c.y <= fb.y + fb.height;
      });
      groups.push({ name: f.type === 'frame' ? (f as { name: string }).name || `Slide ${i + 1}` : `Slide ${i + 1}`, items: inside });
    });
  } else {
    // chunk elements into slides by row bands
    const sorted = [...elements].sort((a, b) => a.y - b.y);
    const chunkSize = Math.max(6, Math.ceil(sorted.length / Math.max(1, Math.ceil(sorted.length / 12))));
    for (let i = 0; i < sorted.length; i += chunkSize) {
      groups.push({ name: `Slide ${groups.length + 1}`, items: sorted.slice(i, i + chunkSize) });
    }
    if (!groups.length) groups.push({ name: 'Slide 1', items: [] });
  }

  for (const group of groups) {
    const slide = pptx.addSlide();
    slide.background = { color: opts.transparent ? 'FFFFFF' : opts.background.replace('#', '') };
    if (group.items.length) {
      const blob = await exportPNG(group.items, {
        ...opts,
        transparent: false,
        background: opts.background,
        scale: 2,
        padding: 16,
      });
      const dataUrl = await blobToDataUrl(blob);
      const b = unionBounds(group.items.map((e) => elementBounds(e)));
      const maxW = 9.2;
      const maxH = 4.9;
      const ratio = Math.min(maxW / b.width, maxH / b.height);
      const w = b.width * ratio;
      const h = b.height * ratio;
      slide.addImage({ data: dataUrl, x: (10 - w) / 2, y: (5.63 - h) / 2, w, h });
    }
    slide.addText(group.name, {
      x: 0.3,
      y: 5.1,
      w: 9,
      h: 0.4,
      fontSize: 11,
      color: '7A7A8C',
      fontFace: 'Arial',
    });
  }
  return (await pptx.write({ outputType: 'blob' })) as Blob;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export function download(blob: Blob | string, filename: string) {
  const url = typeof blob === 'string' ? blob : URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof blob !== 'string') setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportJSON(doc: BoardDocument) {
  download(new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' }), `${slug(doc.name)}.collabboard.json`);
}

export function slug(name: string) {
  return (name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
}

export async function copyPngToClipboard(elements: BoardElement[], opts: ExportOptions): Promise<boolean> {
  try {
    const blob = await exportPNG(elements, opts);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyNav = navigator as any;
    if (!anyNav.clipboard || typeof ClipboardItem === 'undefined') return false;
    await anyNav.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

/** Thumbnail for the board library — small PNG data url. */
export async function makeThumbnail(elements: BoardElement[], theme: 'dark' | 'light'): Promise<string> {
  if (!elements.length) return '';
  const { canvas } = await renderToCanvas(elements, {
    scale: 1,
    background: theme === 'dark' ? '#0f1016' : '#fbfbfd',
    transparent: false,
    padding: 24,
    theme,
  });
  const max = 420;
  const ratio = Math.min(max / canvas.width, max / canvas.height, 1);
  const small = blankCanvas(canvas.width * ratio, canvas.height * ratio);
  const ctx = small.getContext('2d');
  if (ctx) {
    ctx.fillStyle = theme === 'dark' ? '#0f1016' : '#fbfbfd';
    ctx.fillRect(0, 0, small.width, small.height);
    ctx.drawImage(canvas, 0, 0, small.width, small.height);
  }
  return small.toDataURL('image/png');
}

/* ------------------------- clipboard helpers --------------------- */
export async function elementsFromClipboard(event: ClipboardEvent, zoom: number, offset: { x: number; y: number }): Promise<{ text?: string; image?: string; svg?: string }> {
  const items = event.clipboardData?.items;
  if (!items) return {};
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        const url = await blobToDataUrl(file);
        return { image: url };
      }
    }
    if (item.type === 'text/plain') {
      const text = event.clipboardData?.getData('text/plain');
      if (text) return { text };
    }
  }
  void zoom;
  void offset;
  return {};
}

export { fontStack, wrapText, getCachedImage };
