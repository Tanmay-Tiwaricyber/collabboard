import getStroke from 'perfect-freehand';
import type {
  ArrowHead,
  BackgroundPattern,
  BoardElement,
  FreedrawElement,
  ImageElement,
  LinearElement,
  ShapeElement,
  StickyElement,
  TextElement,
} from '../types';
import { drawDrawableOnCanvas, drawableToSvgPaths, getLinearDrawable, getShapeDrawable, roundedRectPath } from './rough';
import { elementBounds, fontStack, normalizeBounds, wrapText } from '../utils/geometry';

/* -------------------------- image cache -------------------------- */
const imageCache = new Map<string, HTMLImageElement>();
const imagePending = new Set<string>();

export function getCachedImage(src: string, onLoad: () => void): HTMLImageElement | null {
  const hit = imageCache.get(src);
  if (hit) return hit.complete ? hit : null;
  if (imagePending.has(src)) return null;
  imagePending.add(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    imagePending.delete(src);
    imageCache.set(src, img);
    onLoad();
  };
  img.onerror = () => imagePending.delete(src);
  img.src = src;
  return null;
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const cached = imageCache.get(src);
    if (cached) return resolve(cached);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

/* ------------------------ freedraw stroke ------------------------ */
function strokeOptions(el: FreedrawElement) {
  const thinning = el.drawTool === 'pencil' ? 0.72 : el.drawTool === 'highlighter' ? 0.22 : 0.55;
  return {
    size: el.strokeWidth * (el.drawTool === 'pencil' ? 1.25 : el.drawTool === 'highlighter' ? 3.4 : 2.2),
    thinning,
    smoothing: el.drawTool === 'pencil' ? 0.42 : 0.62,
    streamline: el.drawTool === 'pencil' ? 0.34 : 0.52,
    easing: (t: number) => t,
    simulatePressure: el.simulatePressure,
    last: true,
  };
}

function freedrawPathData(el: FreedrawElement): { d: string; minX: number; minY: number } {
  const size = strokeOptions(el).size;
  const outline = getStroke(
    el.points.map((p, i) => [p[0], p[1], el.pressures[i] ?? 0.5]),
    strokeOptions(el),
  );
  if (!outline.length) return { d: '', minX: 0, minY: 0 };
  let d = '';
  let minX = Infinity;
  let minY = Infinity;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < outline.length; i++) {
    const [x, y] = outline[i];
    xs.push(x);
    ys.push(y);
    minX = Math.min(minX, x - size);
    minY = Math.min(minY, y - size);
    if (i === 0) d += `M${x.toFixed(2)} ${y.toFixed(2)} `;
    else d += `L${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  d += 'Z';
  return { d, minX: Math.min(...xs), minY: Math.min(...ys) };
}

export function drawFreedraw(ctx: CanvasRenderingContext2D, el: FreedrawElement) {
  const { d } = freedrawPathData(el);
  if (!d) return;
  ctx.save();
  ctx.translate(el.x, el.y);
  if (el.angle) {
    ctx.translate(el.width / 2, el.height / 2);
    ctx.rotate(el.angle);
    ctx.translate(-el.width / 2, -el.height / 2);
  }
  const p = new Path2D(d);
  if (el.drawTool === 'highlighter') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.32;
  }
  ctx.fillStyle = el.strokeColor;
  ctx.fill(p);
  ctx.restore();
}

/* --------------------------- arrowheads -------------------------- */
export function arrowheadPolygon(
  tip: [number, number],
  angle: number,
  head: ArrowHead,
  size: number,
): { lines: [number, number][][]; poly?: [number, number][]; circle?: [number, number, number]; bar?: [number, number][] } {
  const out: ReturnType<typeof arrowheadPolygon> = { lines: [] };
  const a = angle;
  if (head === 'none') return out;
  const s = Math.max(size, 8);
  const back: [number, number] = [tip[0] - Math.cos(a) * s, tip[1] - Math.sin(a) * s];
  switch (head) {
    case 'arrow':
      out.lines.push(
        [
          [back[0] + Math.cos(a + Math.PI / 2) * s * 0.5, back[1] + Math.sin(a + Math.PI / 2) * s * 0.5],
          tip,
        ],
        [
          [back[0] + Math.cos(a - Math.PI / 2) * s * 0.5, back[1] + Math.sin(a - Math.PI / 2) * s * 0.5],
          tip,
        ],
      );
      break;
    case 'triangle':
      out.poly = [
        tip,
        [back[0] + Math.cos(a + Math.PI / 2) * s * 0.42, back[1] + Math.sin(a + Math.PI / 2) * s * 0.42],
        [back[0] + Math.cos(a - Math.PI / 2) * s * 0.42, back[1] + Math.sin(a - Math.PI / 2) * s * 0.42],
      ];
      break;
    case 'circle':
      out.circle = [back[0], back[1], s * 0.32];
      break;
    case 'bar':
      out.bar = [
        [tip[0] + Math.cos(a + Math.PI / 2) * s * 0.5, tip[1] + Math.sin(a + Math.PI / 2) * s * 0.5],
        [tip[0] + Math.cos(a - Math.PI / 2) * s * 0.5, tip[1] + Math.sin(a - Math.PI / 2) * s * 0.5],
      ];
      break;
    default:
      break;
  }
  return out;
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: [number, number],
  angle: number,
  head: ArrowHead,
  size: number,
  color: string,
  width: number,
) {
  const geo = arrowheadPolygon(tip, angle, head, size);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const line of geo.lines) {
    ctx.beginPath();
    ctx.moveTo(line[0][0], line[0][1]);
    ctx.lineTo(line[1][0], line[1][1]);
    ctx.stroke();
  }
  if (geo.poly) {
    ctx.beginPath();
    ctx.moveTo(geo.poly[0][0], geo.poly[0][1]);
    for (let i = 1; i < geo.poly.length; i++) ctx.lineTo(geo.poly[i][0], geo.poly[i][1]);
    ctx.closePath();
    ctx.fill();
  }
  if (geo.circle) {
    ctx.beginPath();
    ctx.arc(geo.circle[0], geo.circle[1], geo.circle[2], 0, Math.PI * 2);
    ctx.fill();
  }
  if (geo.bar) {
    ctx.beginPath();
    ctx.moveTo(geo.bar[0][0], geo.bar[0][1]);
    ctx.lineTo(geo.bar[1][0], geo.bar[1][1]);
    ctx.stroke();
  }
  ctx.restore();
}

function polylineAngles(pts: [number, number][]) {
  const angles: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    angles.push(Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]));
  }
  return angles;
}

export function drawLinear(ctx: CanvasRenderingContext2D, el: LinearElement, resolvePoint?: (p: [number, number], binding: string | null) => [number, number]) {
  const pts: [number, number][] = el.points.map((p) => [el.x + p[0], el.y + p[1]]);
  if (pts.length < 2) return;
  const drawable = getLinearDrawable(el);
  ctx.save();
  drawDrawableOnCanvas(ctx, drawable);
  ctx.restore();
  const angles = polylineAngles(pts);
  const size = 8 + el.strokeWidth * 2.4;
  void resolvePoint;
  drawArrowhead(
    ctx,
    pts[pts.length - 1],
    angles[angles.length - 1] ?? 0,
    el.endArrowhead,
    size,
    el.strokeColor,
    el.strokeWidth * 1.1,
  );
  if (el.startArrowhead !== 'none') {
    drawArrowhead(
      ctx,
      pts[0],
      (angles[0] ?? 0) + Math.PI,
      el.startArrowhead,
      size,
      el.strokeColor,
      el.strokeWidth * 1.1,
    );
  }
}

/* ----------------------------- text ------------------------------ */
export function textLines(el: TextElement, ctx?: CanvasRenderingContext2D): string[] {
  const font = `${el.fontSize}px ${fontStack(el.fontFamily)}`;
  const maxWidth = Math.abs(el.width);
  return wrapText(ctx ?? null, el.text, maxWidth, font);
}

export function drawText(ctx: CanvasRenderingContext2D, el: TextElement) {
  const font = `${el.fontSize}px ${fontStack(el.fontFamily)}`;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = el.strokeColor;
  ctx.textBaseline = 'middle';
  const lines = textLines(el, ctx);
  const lineHeight = el.fontSize * el.lineHeight;
  const totalH = Math.max(lines.length, 1) * lineHeight;
  let startY = el.y + lineHeight / 2;
  if (el.verticalAlign === 'middle') startY = el.y + (el.height - totalH) / 2 + lineHeight / 2;
  if (el.verticalAlign === 'bottom') startY = el.y + el.height - totalH + lineHeight / 2;

  lines.forEach((line, i) => {
    const y = startY + i * lineHeight;
    let x = el.x;
    if (el.textAlign === 'center') {
      ctx.textAlign = 'center';
      x = el.x + el.width / 2;
    } else if (el.textAlign === 'right') {
      ctx.textAlign = 'right';
      x = el.x + el.width;
    } else {
      ctx.textAlign = 'left';
    }
    if (el.strokeStyle === 'dashed' && el.opacity < 1) ctx.globalAlpha = el.opacity;
    ctx.fillText(line, x, y);
  });
  ctx.restore();
}

/* --------------------------- sticky ----------------------------- */
export function drawSticky(ctx: CanvasRenderingContext2D, el: StickyElement) {
  const b = normalizeBounds(el);
  ctx.save();
  if (el.angle) {
    ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
    ctx.rotate(el.angle);
    ctx.translate(-(b.x + b.width / 2), -(b.y + b.height / 2));
  }
  ctx.fillStyle = el.backgroundColor;
  ctx.strokeStyle = 'rgba(0,0,0,0.10)';
  ctx.lineWidth = 1;
  const r = Math.min(6, b.width / 6, b.height / 6);
  const path = new Path2D(roundedRectPath(b.x, b.y, b.width, b.height, r));
  ctx.fill(path);
  // fold corner
  ctx.beginPath();
  ctx.moveTo(b.x + b.width - 22, b.y + b.height);
  ctx.lineTo(b.x + b.width, b.y + b.height - 22);
  ctx.lineTo(b.x + b.width, b.y + b.height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fill();
  ctx.stroke(path);

  const pad = 14;
  const font = `${el.fontSize}px ${fontStack(el.fontFamily)}`;
  ctx.font = font;
  ctx.fillStyle = '#1f2430';
  ctx.textBaseline = 'middle';
  const lines = wrapText(ctx, el.text, b.width - pad * 2, font);
  const lh = el.fontSize * 1.32;
  lines.forEach((line, i) => {
    const y = b.y + pad + lh / 2 + i * lh;
    if (y > b.y + b.height - 4) return;
    if (el.textAlign === 'center') {
      ctx.textAlign = 'center';
      ctx.fillText(line, b.x + b.width / 2, y);
    } else if (el.textAlign === 'right') {
      ctx.textAlign = 'right';
      ctx.fillText(line, b.x + b.width - pad, y);
    } else {
      ctx.textAlign = 'left';
      ctx.fillText(line, b.x + pad, y);
    }
  });
  ctx.restore();
}

/* ----------------------------- frame ---------------------------- */
export function drawFrame(ctx: CanvasRenderingContext2D, el: BoardElement & { name: string }, accent: string) {
  const b = normalizeBounds(el);
  ctx.save();
  ctx.strokeStyle = accent;
  ctx.fillStyle = 'rgba(109,94,252,0.05)';
  ctx.lineWidth = 1.5;
  ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeRect(b.x, b.y, b.width, b.height);
  ctx.font = `600 13px Inter, sans-serif`;
  ctx.fillStyle = accent;
  ctx.textBaseline = 'bottom';
  ctx.textAlign = 'left';
  ctx.fillText(el.name || 'Frame', b.x, b.y - 8);
  ctx.restore();
}

/* ------------------------- main element ------------------------- */
export interface RenderOptions {
  theme: 'dark' | 'light';
  selectionColor: string;
  onImageLoad?: () => void;
  hideFrames?: boolean;
  pattern?: BackgroundPattern;
}

export function drawElement(
  ctx: CanvasRenderingContext2D,
  el: BoardElement,
  opts: RenderOptions,
) {
  if (el.width === 0 && el.height === 0 && el.type !== 'freedraw' && el.type !== 'line') return;
  ctx.save();
  ctx.globalAlpha = el.opacity;

  if (el.type !== 'freedraw' && el.angle) {
    const b = normalizeBounds(el);
    ctx.translate(b.x + b.width / 2, b.y + b.height / 2);
    ctx.rotate(el.angle);
    ctx.translate(-(b.x + b.width / 2), -(b.y + b.height / 2));
  }

  switch (el.type) {
    case 'freedraw':
      ctx.globalAlpha = el.opacity;
      drawFreedraw(ctx, el);
      break;
    case 'rectangle':
    case 'diamond':
    case 'ellipse': {
      const drawable = getShapeDrawable(el);
      if (drawable) drawDrawableOnCanvas(ctx, drawable);
      break;
    }
    case 'line':
    case 'arrow':
      drawLinear(ctx, el);
      break;
    case 'text':
      drawText(ctx, el);
      break;
    case 'sticky':
      drawSticky(ctx, el);
      break;
    case 'image': {
      const img = getCachedImage((el as ImageElement).src, () => opts.onImageLoad?.());
      const b = normalizeBounds(el);
      if (img) {
        ctx.drawImage(img, b.x, b.y, b.width, b.height);
      } else {
        ctx.fillStyle = 'rgba(120,120,140,0.12)';
        ctx.fillRect(b.x, b.y, b.width, b.height);
      }
      if (el.strokeStyle !== 'solid' || el.strokeWidth > 0) {
        // no border for images by default
      }
      break;
    }
    case 'frame':
      if (!opts.hideFrames) drawFrame(ctx, el as unknown as ShapeElement & { name: string }, opts.selectionColor);
      break;
    default:
      break;
  }
  void (el as ShapeElement).roundness;
  ctx.restore();
}

/* -------------------------- background -------------------------- */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  zoom: number,
  scrollX: number,
  scrollY: number,
  pattern: string,
  theme: 'dark' | 'light',
) {
  ctx.save();
  ctx.fillStyle = theme === 'dark' ? '#0f1016' : '#fbfbfd';
  ctx.fillRect(0, 0, width, height);
  if (pattern === 'none') {
    ctx.restore();
    return;
  }

  const spacing = pattern === 'lines' ? 32 : 24;
  const step = spacing * zoom;
  if (step < 6) {
    ctx.restore();
    return;
  }
  const offsetX = ((scrollX % step) + step) % step;
  const offsetY = ((scrollY % step) + step) % step;
  const dot = theme === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(15,20,40,0.16)';
  const line = theme === 'dark' ? 'rgba(255,255,255,0.055)' : 'rgba(15,20,40,0.055)';
  if (pattern === 'dots') {
    const r = Math.min(1.5, Math.max(0.6, zoom * 1.1));
    ctx.fillStyle = dot;
    for (let x = offsetX; x < width + step; x += step) {
      for (let y = offsetY; y < height + step; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (pattern === 'grid') {
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = offsetX; x < width + step; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
    }
    for (let y = offsetY; y < height + step; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  } else if (pattern === 'lines') {
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = offsetY; y < height + step; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(width, Math.round(y) + 0.5);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/* ---------------------------- scene ----------------------------- */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  elements: BoardElement[],
  view: { zoom: number; scrollX: number; scrollY: number; width: number; height: number },
  opts: RenderOptions,
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawBackground(
    ctx,
    view.width,
    view.height,
    view.zoom,
    view.scrollX,
    view.scrollY,
    opts.pattern ?? 'dots',
    opts.theme,
  );
  ctx.setTransform(view.zoom, 0, 0, view.zoom, view.scrollX, view.scrollY);
  const frames = elements.filter((e) => e.type === 'frame');
  const rest = elements.filter((e) => e.type !== 'frame');
  for (const el of [...frames, ...rest]) {
    if (el.width === 0 && el.height === 0 && el.type !== 'freedraw') continue;
    drawElement(ctx, el, opts);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/* ------------------------- svg export --------------------------- */
export function elementToSvg(el: BoardElement): string {
  const b = elementBounds(el);
  const rotate = el.angle
    ? ` transform="rotate(${(el.angle * 180) / Math.PI} ${b.x + b.width / 2} ${b.y + b.height / 2})"`
    : '';
  const opacity = el.opacity !== 1 ? ` opacity="${el.opacity}"` : '';
  const wrap = (inner: string) => `<g${rotate}${opacity}>${inner}</g>`;

  switch (el.type) {
    case 'freedraw': {
      const { d } = freedrawPathData(el as FreedrawElement);
      const fill = (el as FreedrawElement).strokeColor;
      const alpha = (el as FreedrawElement).drawTool === 'highlighter' ? 0.35 : 1;
      return wrap(
        `<path d="${d}" fill="${fill}" opacity="${alpha}" transform="translate(${el.x} ${el.y})"/>`,
      );
    }
    case 'rectangle':
    case 'diamond':
    case 'ellipse': {
      const drawable = getShapeDrawable(el);
      return wrap(drawable ? drawableToSvgPaths(drawable) : '');
    }
    case 'line':
    case 'arrow': {
      const linear = el as LinearElement;
      const pts = linear.points.map((p) => [linear.x + p[0], linear.y + p[1]] as [number, number]);
      if (pts.length < 2) return '';
      const drawable = getLinearDrawable(linear);
      const path = drawableToSvgPaths(drawable);
      const angles = polylineAngles(pts);
      const headSize = 8 + el.strokeWidth * 2.4;
      let extra = '';
      const headMarkup = (tip: [number, number], angle: number, head: ArrowHead) => {
        const geo = arrowheadPolygon(tip, angle, head, headSize);
        let out = '';
        for (const line of geo.lines) {
          out += `<path d="M${line[0][0]} ${line[0][1]} L${line[1][0]} ${line[1][1]}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}" fill="none" stroke-linecap="round"/>`;
        }
        if (geo.poly) {
          out += `<path d="M${geo.poly.map((p) => `${p[0]} ${p[1]}`).join(' L')} Z" fill="${el.strokeColor}"/>`;
        }
        if (geo.circle) {
          out += `<circle cx="${geo.circle[0]}" cy="${geo.circle[1]}" r="${geo.circle[2]}" fill="${el.strokeColor}"/>`;
        }
        if (geo.bar) {
          out += `<path d="M${geo.bar[0][0]} ${geo.bar[0][1]} L${geo.bar[1][0]} ${geo.bar[1][1]}" stroke="${el.strokeColor}" stroke-width="${el.strokeWidth}"/>`;
        }
        return out;
      };
      extra += headMarkup(pts[pts.length - 1], angles[angles.length - 1] ?? 0, linear.endArrowhead);
      if (linear.startArrowhead !== 'none') {
        extra += headMarkup(pts[0], (angles[0] ?? 0) + Math.PI, linear.startArrowhead);
      }
      return wrap(path + extra);
    }
    case 'text': {
      const t = el as TextElement;
      const font = `${t.fontSize}px ${fontStack(t.fontFamily)}`;
      const lines = wrapText(null, t.text, 0, font);
      const lh = t.fontSize * t.lineHeight;
      let startY = t.y + lh / 2;
      const totalH = lines.length * lh;
      if (t.verticalAlign === 'middle') startY = t.y + (t.height - totalH) / 2 + lh / 2;
      if (t.verticalAlign === 'bottom') startY = t.y + t.height - totalH + lh / 2;
      const anchor = t.textAlign === 'center' ? 'middle' : t.textAlign === 'right' ? 'end' : 'start';
      const x = t.textAlign === 'center' ? t.x + t.width / 2 : t.textAlign === 'right' ? t.x + t.width : t.x;
      const rows = lines
        .map(
          (line, i) =>
            `<text x="${x}" y="${startY + i * lh}" font-family="${fontStack(t.fontFamily).replace(
              /"/g,
              "'",
            )}" font-size="${t.fontSize}" fill="${t.strokeColor}" text-anchor="${anchor}" dominant-baseline="middle">${escapeXml(
              line,
            )}</text>`,
        )
        .join('');
      return wrap(rows);
    }
    case 'sticky': {
      const s = el as StickyElement;
      const font = `${s.fontSize}px ${fontStack(s.fontFamily)}`;
      const lines = wrapText(null, s.text, 0, font);
      const lh = s.fontSize * 1.32;
      const rows = lines
        .map(
          (line, i) =>
            `<text x="${b.x + 14}" y="${b.y + 14 + lh / 2 + i * lh}" font-family="${fontStack(
              s.fontFamily,
            ).replace(/"/g, "'")}" font-size="${s.fontSize}" fill="#1f2430">${escapeXml(line)}</text>`,
        )
        .join('');
      return wrap(
        `<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="6" fill="${el.backgroundColor}"/>${rows}`,
      );
    }
    case 'image': {
      return wrap(
        `<image x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" href="${(el as ImageElement).src}" preserveAspectRatio="none"/>`,
      );
    }
    case 'frame':
      return '';
    default:
      return '';
  }
}

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function sceneToSvg(
  elements: BoardElement[],
  bounds: { x: number; y: number; width: number; height: number },
  background: string,
  pad = 24,
) {
  const vb = {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: Math.max(bounds.width + pad * 2, 1),
    height: Math.max(bounds.height + pad * 2, 1),
  };
  const body = elements.map(elementToSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(vb.width)}" height="${Math.round(
    vb.height,
  )}" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}"><rect x="${vb.x}" y="${vb.y}" width="${
    vb.width
  }" height="${vb.height}" fill="${background}"/>${body}</svg>`;
}

export function exportPadding(b: { width: number; height: number }) {
  return Math.max(24, Math.min(160, Math.max(b.width, b.height) * 0.06));
}

export function drawableForExport(el: BoardElement) {
  if (el.type === 'rectangle' || el.type === 'diamond' || el.type === 'ellipse') return getShapeDrawable(el);
  return null;
}
