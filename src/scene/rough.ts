import rough from 'roughjs/bin/rough';
import type { RoughGenerator } from 'roughjs/bin/generator';
import type { Drawable, Options } from 'roughjs/bin/core';
import type { BoardElement, FillStyle, StrokeStyle } from '../types';

const generator: RoughGenerator = rough.generator();

const dashFor = (style: StrokeStyle, width: number): number[] | undefined => {
  if (style === 'dashed') return [Math.max(width * 3, 6), Math.max(width * 2.4, 6)];
  if (style === 'dotted') return [1, Math.max(width * 2, 4)];
  return undefined;
};

const fillStyleFor = (style: FillStyle): Options['fillStyle'] => {
  switch (style) {
    case 'cross-hatch':
      return 'cross-hatch';
    case 'solid':
      return 'solid';
    case 'dots':
      return 'dots';
    case 'zigzag':
      return 'zigzag';
    default:
      return 'hachure';
  }
};

export function roughOptions(el: BoardElement, strokeColor?: string): Options {
  const width = el.strokeWidth;
  return {
    seed: el.seed,
    stroke: strokeColor ?? el.strokeColor,
    strokeWidth: width,
    roughness: el.roughness,
    bowing: el.roughness > 0 ? 1 : 0,
    fill: el.backgroundColor === 'transparent' ? undefined : el.backgroundColor,
    fillStyle: fillStyleFor(el.fillStyle),
    fillWeight: Math.max(width / 2, 1),
    hachureGap: Math.max(width * 4, 4),
    hachureAngle: -41,
    strokeLineDash: dashFor(el.strokeStyle, width),
    preserveVertices: true,
    disableMultiStroke: el.roughness === 0,
  };
}

/* ------------------------------------------------------------------ *
 * Drawable cache — rough shape generation is the hot path while
 * dragging/resizing, so results are memoised per element state.
 * ------------------------------------------------------------------ */
const cache = new Map<string, Drawable>();
const MAX_CACHE = 900;

function cacheKey(el: BoardElement, extra = '') {
  return [
    el.type,
    el.id,
    el.version,
    Math.round(el.width),
    Math.round(el.height),
    el.strokeColor,
    el.backgroundColor,
    el.fillStyle,
    el.strokeWidth,
    el.strokeStyle,
    el.roughness,
    el.seed,
    extra,
  ].join('|');
}

function memo(key: string, make: () => Drawable): Drawable {
  const hit = cache.get(key);
  if (hit) return hit;
  const made = make();
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, made);
  return made;
}

export function getShapeDrawable(el: BoardElement): Drawable | null {
  if (el.type !== 'rectangle' && el.type !== 'diamond' && el.type !== 'ellipse') return null;
  const w = Math.abs(el.width);
  const h = Math.abs(el.height);
  if (w < 0.5 || h < 0.5) return null;
  const x = Math.min(el.x, el.x + el.width);
  const y = Math.min(el.y, el.y + el.height);
  const opts = roughOptions(el);
  const round = el.type === 'rectangle' ? Math.min(el.roundness, Math.min(w, h) / 2) : 0;

  return memo(cacheKey(el, String(round)), () => {
    switch (el.type) {
      case 'ellipse':
        return generator.ellipse(x + w / 2, y + h / 2, w, h, opts);
      case 'diamond':
        return generator.polygon(
          [
            [x + w / 2, y],
            [x + w, y + h / 2],
            [x + w / 2, y + h],
            [x, y + h / 2],
          ],
          opts,
        );
      default:
        return round > 0
          ? generator.path(roundedRectPath(x, y, w, h, round), opts)
          : generator.rectangle(x, y, w, h, opts);
    }
  });
}

export function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  return `M ${x + rad} ${y} L ${x + w - rad} ${y} Q ${x + w} ${y} ${x + w} ${y + rad} L ${x + w} ${
    y + h - rad
  } Q ${x + w} ${y + h} ${x + w - rad} ${y + h} L ${x + rad} ${y + h} Q ${x} ${y + h} ${x} ${
    y + h - rad
  } L ${x} ${y + rad} Q ${x} ${y} ${x + rad} ${y} Z`;
}

/** Execute a rough drawable onto a 2D canvas context (respects current transform). */
export function drawDrawableOnCanvas(ctx: CanvasRenderingContext2D, drawable: Drawable) {
  const opts = drawable.options;
  for (const set of drawable.sets) {
    const p = new Path2D();
    for (const op of set.ops) {
      const d = op.data;
      switch (op.op) {
        case 'move':
          p.moveTo(d[0], d[1]);
          break;
        case 'lineTo':
          p.lineTo(d[0], d[1]);
          break;
        case 'bcurveTo':
          p.bezierCurveTo(d[0], d[1], d[2], d[3], d[4], d[5]);
          break;
        default:
          break;
      }
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (set.type === 'path') {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = opts.strokeWidth;
      if (opts.strokeLineDash?.length) ctx.setLineDash(opts.strokeLineDash);
      ctx.stroke(p);
    } else if (set.type === 'fillPath') {
      ctx.fillStyle = opts.fill ?? 'transparent';
      ctx.fill(p);
    } else {
      ctx.strokeStyle = opts.fill ?? 'transparent';
      ctx.lineWidth = opts.fillWeight ?? 1;
      ctx.stroke(p);
    }
    ctx.restore();
  }
}

function opsToPath(ops: { op: string; data: number[] }[]): string {
  let d = '';
  for (const op of ops) {
    const data = op.data;
    if (op.op === 'move') d += `M${data[0].toFixed(2)} ${data[1].toFixed(2)} `;
    else if (op.op === 'lineTo') d += `L${data[0].toFixed(2)} ${data[1].toFixed(2)} `;
    else if (op.op === 'bcurveTo')
      d += `C${data[0].toFixed(2)} ${data[1].toFixed(2)} ${data[2].toFixed(2)} ${data[3].toFixed(
        2,
      )} ${data[4].toFixed(2)} ${data[5].toFixed(2)} `;
  }
  return d.trim();
}

/** Serialise a rough drawable to SVG markup. */
export function drawableToSvgPaths(drawable: Drawable) {
  const opts = drawable.options;
  const dash = opts.strokeLineDash?.length
    ? ` stroke-dasharray="${opts.strokeLineDash.join(' ')}"`
    : '';
  return drawable.sets
    .map((set) => {
      const d = opsToPath(set.ops as { op: string; data: number[] }[]);
      if (!d) return '';
      if (set.type === 'path') {
        return `<path d="${d}" fill="none" stroke="${opts.stroke}" stroke-width="${opts.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dash}/>`;
      }
      if (set.type === 'fillPath') {
        return `<path d="${d}" fill="${opts.fill ?? 'none'}" stroke="none"/>`;
      }
      return `<path d="${d}" fill="none" stroke="${opts.fill ?? 'none'}" stroke-width="${
        opts.fillWeight ?? 1
      }" stroke-linecap="round"/>`;
    })
    .join('');
}

/** Simple linear-element drawable (multi-point polyline) used for arrows/lines. */
export function getLinearDrawable(el: BoardElement & { points: [number, number][] }): Drawable {
  const pts = el.points.map(([px, py]) => [el.x + px, el.y + py] as [number, number]);
  const opts = roughOptions(el);
  return memo(cacheKey(el, `lin${pts.length}`), () =>
    pts.length > 2 ? generator.linearPath(pts, opts) : generator.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], opts) as Drawable,
  );
}
