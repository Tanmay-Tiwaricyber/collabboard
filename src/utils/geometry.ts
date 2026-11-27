import type { BoardElement, LinearElement, TextElement } from '../types';

export const nanoid = (size = 12): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let out = '';
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < size; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
};

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const isLinear = (el: BoardElement): el is LinearElement =>
  el.type === 'arrow' || el.type === 'line';

export const isText = (el: BoardElement): el is TextElement => el.type === 'text';

export const hasText = (el: BoardElement): el is TextElement | Extract<BoardElement, { type: 'sticky' }> =>
  el.type === 'text' || el.type === 'sticky';

export const elementCenter = (el: BoardElement) => ({
  x: el.x + Math.abs(el.width) / 2,
  y: el.y + Math.abs(el.height) / 2,
});

export function normalizeBounds(el: BoardElement) {
  return {
    x: Math.min(el.x, el.x + el.width),
    y: Math.min(el.y, el.y + el.height),
    width: Math.abs(el.width),
    height: Math.abs(el.height),
  };
}

export function elementBounds(el: BoardElement) {
  if (isLinear(el) || el.type === 'freedraw') {
    const pts = (el as { points: [number, number][] }).points;
    if (!pts.length) return { x: el.x, y: el.y, width: 0, height: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
      minX = Math.min(minX, px);
      minY = Math.min(minY, py);
      maxX = Math.max(maxX, px);
      maxY = Math.max(maxY, py);
    }
    return {
      x: el.x + minX,
      y: el.y + minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
  return normalizeBounds(el);
}

export type Bounds = { x: number; y: number; width: number; height: number };

export function unionBounds(list: Bounds[]): Bounds {
  if (!list.length) return { x: 0, y: 0, width: 0, height: 0 };
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of list) {
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function padBounds(b: Bounds, pad: number): Bounds {
  return { x: b.x - pad, y: b.y - pad, width: b.width + pad * 2, height: b.height + pad * 2 };
}

export function boundsIntersect(a: Bounds, b: Bounds) {
  return (
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
  );
}

export function pointInBounds(px: number, py: number, b: Bounds, pad = 0) {
  return px >= b.x - pad && px <= b.x + b.width + pad && py >= b.y - pad && py <= b.y + b.height + pad;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Distance from a point to an element's rendered outline, in scene units. */
export function distanceToElement(px: number, py: number, el: BoardElement): number {
  const b = elementBounds(el);
  const filled = el.backgroundColor !== 'transparent';
  if (!filled && (el.type === 'rectangle' || el.type === 'frame' || el.type === 'sticky')) {
    const edges = [
      [b.x, b.y, b.x + b.width, b.y],
      [b.x + b.width, b.y, b.x + b.width, b.y + b.height],
      [b.x + b.width, b.y + b.height, b.x, b.y + b.height],
      [b.x, b.y + b.height, b.x, b.y],
    ];
    let best = Infinity;
    for (const [x1, y1, x2, y2] of edges) best = Math.min(best, distToSegment(px, py, x1, y1, x2, y2));
    return best;
  }
  if (el.type === 'ellipse') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const rx = Math.max(b.width / 2, 0.001);
    const ry = Math.max(b.height / 2, 0.001);
    const norm = Math.hypot((px - cx) / rx, (py - cy) / ry);
    const rough = Math.min(rx, ry) * Math.abs(1 - norm);
    return pointInBounds(px, py, b) === false && norm > 1.2
      ? Math.hypot(px - cx, py - cy)
      : rough;
  }
  if (el.type === 'diamond') {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const pts: [number, number][] = [
      [cx, b.y],
      [b.x + b.width, cy],
      [cx, b.y + b.height],
      [b.x, cy],
    ];
    let best = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const c = pts[(i + 1) % 4];
      best = Math.min(best, distToSegment(px, py, a[0], a[1], c[0], c[1]));
    }
    return best;
  }
  if (el.type === 'freedraw' || el.type === 'arrow' || el.type === 'line') {
    const pts = (el as { points: [number, number][] }).points;
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      best = Math.min(
        best,
        distToSegment(
          px,
          py,
          el.x + pts[i - 1][0],
          el.y + pts[i - 1][1],
          el.x + pts[i][0],
          el.y + pts[i][1],
        ),
      );
    }
    if (pts.length === 1) best = Math.hypot(px - (el.x + pts[0][0]), py - (el.y + pts[0][1]));
    return best;
  }
  if (pointInBounds(px, py, b)) return 0;
  return Math.min(
    Math.hypot(px - b.x, py - b.y),
    Math.hypot(px - (b.x + b.width), py - b.y),
    Math.hypot(px - b.x, py - (b.y + b.height)),
    Math.hypot(px - (b.x + b.width), py - (b.y + b.height)),
  );
}

export function hitTest(
  px: number,
  py: number,
  elements: BoardElement[],
  zoom: number,
): BoardElement | null {
  const tolerance = Math.max(6 / zoom, 4);
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.locked) continue;
    const b = elementBounds(el);
    const inside = pointInBounds(px, py, padBounds(b, tolerance));
    if (!inside) continue;
    if (el.backgroundColor !== 'transparent' && pointInBounds(px, py, b)) return el;
    if (distanceToElement(px, py, el) <= Math.max(tolerance, el.strokeWidth / 2 + 2)) return el;
  }
  return null;
}

/** Elements whose outline passes close to a circle around (px,py) — used by the eraser. */
export function elementsInRadius(
  px: number,
  py: number,
  radius: number,
  elements: BoardElement[],
): BoardElement[] {
  const out: BoardElement[] = [];
  for (const el of elements) {
    if (el.locked || el.type === 'frame') continue;
    const b = elementBounds(el);
    if (!pointInBounds(px, py, padBounds(b, radius + el.strokeWidth))) continue;
    if (distanceToElement(px, py, el) <= radius + el.strokeWidth / 2) out.push(el);
  }
  return out;
}

export function snap(value: number, grid: number, on: boolean) {
  return on ? Math.round(value / grid) * grid : value;
}

/** Text measurement used for wrapping and box sizing, shared between canvas + export. */
export function wrapText(
  ctx: CanvasRenderingContext2D | null,
  text: string,
  maxWidth: number,
  font: string,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph) {
      lines.push('');
      continue;
    }
    if (!ctx || maxWidth <= 0) {
      lines.push(paragraph);
      continue;
    }
    ctx.font = font;
    const words = paragraph.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export const fontStack = (family: string) => {
  switch (family) {
    case 'hand':
      return 'Virgil, "Segoe Print", "Bradley Hand", cursive';
    case 'casual':
      return 'Caveat, "Comic Sans MS", cursive';
    case 'marker':
      return 'Kalam, "Comic Sans MS", cursive';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, monospace';
    default:
      return 'Inter, system-ui, -apple-system, sans-serif';
  }
};
