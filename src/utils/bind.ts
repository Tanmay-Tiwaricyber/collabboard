import type { ArrowHead, BoardElement, LinearElement } from '../types';
import { elementBounds, normalizeBounds } from './geometry';

export function edgePoint(el: BoardElement, towardX: number, towardY: number): [number, number] {
  const b = normalizeBounds(el);
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const dx = towardX - cx;
  const dy = towardY - cy;
  if (dx === 0 && dy === 0) return [cx, cy];

  if (el.type === 'ellipse') {
    const rx = b.width / 2;
    const ry = b.height / 2;
    const t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    return [cx + dx * t, cy + dy * t];
  }
  if (el.type === 'diamond') {
    const scale = 1 / (Math.abs(dx) / (b.width / 2) + Math.abs(dy) / (b.height / 2)) || 0;
    return [cx + dx * scale, cy + dy * scale];
  }
  const hw = b.width / 2;
  const hh = b.height / 2;
  const scale = Math.min(
    Math.abs(dx) > 0 ? hw / Math.abs(dx) : Infinity,
    Math.abs(dy) > 0 ? hh / Math.abs(dy) : Infinity,
  );
  return [cx + dx * scale, cy + dy * scale];
}

export function nearestBindable(
  elements: BoardElement[],
  x: number,
  y: number,
  zoom: number,
  excludeIds: string[] = [],
): BoardElement | null {
  const tol = 18 / zoom;
  let best: BoardElement | null = null;
  let bestDist = Infinity;
  for (const el of elements) {
    if (el.locked || el.type === 'freedraw' || el.type === 'arrow' || el.type === 'line') continue;
    if (excludeIds.includes(el.id)) continue;
    const b = normalizeBounds(el);
    const inside =
      x >= b.x - tol && x <= b.x + b.width + tol && y >= b.y - tol && y <= b.y + b.height + tol;
    if (!inside) continue;
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const d = Math.hypot(x - cx, y - cy) - Math.min(b.width, b.height) / 2;
    if (d < bestDist) {
      bestDist = d;
      best = el;
    }
  }
  return best;
}

/** Re-resolve arrow endpoints against bound shapes. Returns null when nothing changed. */
export function hydrateArrows(elements: BoardElement[]): BoardElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  let changed = false;
  const out = elements.map((el) => {
    if (el.type !== 'arrow' && el.type !== 'line') return el;
    const lin = el as LinearElement;
    if (!lin.startBinding && !lin.endBinding) return el;
    const startEl = lin.startBinding ? byId.get(lin.startBinding) : undefined;
    const endEl = lin.endBinding ? byId.get(lin.endBinding) : undefined;
    if (!startEl && !endEl) return el;
    const first = lin.points[0];
    const last = lin.points[lin.points.length - 1];
    const absStart: [number, number] = [lin.x + first[0], lin.y + first[1]];
    const absEnd: [number, number] = [lin.x + last[0], lin.y + last[1]];
    const newStart = startEl ? edgePoint(startEl, absEnd[0], absEnd[1]) : absStart;
    const newEnd = endEl ? edgePoint(endEl, absStart[0], absStart[1]) : absEnd;
    if (
      Math.abs(newStart[0] - absStart[0]) < 0.5 &&
      Math.abs(newStart[1] - absStart[1]) < 0.5 &&
      Math.abs(newEnd[0] - absEnd[0]) < 0.5 &&
      Math.abs(newEnd[1] - absEnd[1]) < 0.5
    ) {
      return el;
    }
    changed = true;
    return {
      ...lin,
      x: newStart[0],
      y: newStart[1],
      width: newEnd[0] - newStart[0],
      height: newEnd[1] - newStart[1],
      points: [
        [0, 0],
        [newEnd[0] - newStart[0], newEnd[1] - newStart[1]],
      ],
    } as LinearElement;
  });
  return changed ? out : elements;
}

export const arrowSize = (w: number) => 8 + w * 2.4;

export const headOptions: { value: ArrowHead; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'circle', label: 'Dot' },
  { value: 'bar', label: 'Bar' },
];

export function boundsOfSelection(elements: BoardElement[]) {
  if (!elements.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of elements) {
    const b = elementBounds(el);
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.width);
    y2 = Math.max(y2, b.y + b.height);
  }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
