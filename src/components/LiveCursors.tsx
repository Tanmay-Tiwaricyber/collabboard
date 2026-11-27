import { useEffect, useMemo, useRef } from 'react';
import getStroke from 'perfect-freehand';
import { useBoard } from '../store/board';
import { useLive } from '../utils/live';
import type { ToolType } from '../types';

/**
 * 20x20 filled glyphs shown next to a peer's cursor. Each tool gets a
 * clearly different silhouette so they read at a glance at 22px.
 */
const TOOL_ICON: Record<string, string> = {
  // arrow pointer
  select: 'M4 2l12 8-5 1 2.4 5.2-2.2 1-2.4-5.2L5 15z',
  // dashed selection ring
  lasso:
    'M10 3.2c3.9 0 6.8 2.4 6.8 5.4 0 2.6-2.2 4.6-5.2 4.6-1.4 0-2.4-.6-3.1-.6-.7 0-1.2.5-1.2 1.2 0 1.2 1.3 2 2.8 2 .9 0 1.7-.2 2.2-.6l.9 1.6c-.9.6-2 1-3.3 1-2.9 0-5.1-1.7-5.1-4 0-1.8 1.3-3 3.1-3 1 0 1.7.5 2.8.5 1.4 0 2.4-.9 2.4-2.1 0-1.6-1.7-2.9-4-2.9z',
  // open hand
  hand:
    'M6 12V6.5a1.2 1.2 0 012.4 0V9m0-3.5V4.6a1.2 1.2 0 012.4 0V9m0-3a1.2 1.2 0 012.4 0v5.6c0 3.4-2 5.4-5 5.4-2.4 0-3.8-1.2-4.7-3L4.6 11a1.3 1.3 0 012.2-1.3z',
  // fountain-pen nib: pointed teardrop with a slit
  pen:
    'M14.6 3.1l2.3 2.3-8.1 9.2-4.4 1.4 1.4-4.4zM12.9 4.8l2.3 2.3-1.1 1.2-2.3-2.3z',
  // pencil: slim body with a sharpened tip
  pencil:
    'M13.9 3.4l2.6 2.6-7.7 8.6-2.1.6.6-2.1zM4.2 15.9l2.4-.7-1.7-1.7z',
  // chisel-tip highlighter
  highlighter:
    'M11.2 3.6l4.9 4.1-2 2.4-4.9-4.1zM9.2 6.1l4.9 4.1-5.6 6.7H4.4zM3.6 17.4h12.8',
  // eraser block
  eraser:
    'M4.2 12.4l6.9-6.9a1.7 1.7 0 012.4 0l2.3 2.3a1.7 1.7 0 010 2.4l-4.6 4.6H6.6zM8.6 17.2l3.4-3.4',
  // laser burst
  laser:
    'M10 2.6c.5 3.2 2.4 5.1 5.6 5.6-3.2.5-5.1 2.4-5.6 5.6-.5-3.2-2.4-5.1-5.6-5.6 3.2-.5 5.1-2.4 5.6-5.6zM15.4 14.6l1.6 1.6M4 16.2l1.4-1.4',
  // text caret with serifs
  text: 'M4.6 4.4h10.8v2.2h-4.2v9h-2.4v-9H4.6zM6 15.4h8V17H6z',
  // sticky note with folded corner
  sticky: 'M4 3.6h12v7.6l-4.8 5H4zM16 11.6h-4.6v4.3z',
  // frame / slide crop marks
  frame:
    'M6 2.8h1.8v14.4H6zM12.2 2.8h1.8v14.4h-1.8zM2.8 6h14.4v1.8H2.8zM2.8 12.2h14.4v1.8H2.8z',
  // speech bubble
  comment: 'M4 3.8h12v8.4h-6.4L5 16.4v-4.2H4z',
  default: 'M4 2l12 8-5 1 2.4 5.2-2.2 1-2.4-5.2L5 15z',
};

const iconFor = (tool: ToolType) => TOOL_ICON[tool] ?? TOOL_ICON.default;

/** Experimental: draws remote people's cursors, selections and live strokes. */
export default function LiveCursors() {
  const { enabled, peers } = useLive();
  const appZoom = useBoard((s) => s.app.zoom);
  const scrollX = useBoard((s) => s.app.scrollX);
  const scrollY = useBoard((s) => s.app.scrollY);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const peersRef = useRef(peers);
  peersRef.current = peers;

  /* live ink canvas (cheap, redrawn only when someone is drawing) */
  useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const paint = () => {
      rafRef.current = null;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const zoom = useBoard.getState().app.zoom;
      const sx = useBoard.getState().app.scrollX;
      const sy = useBoard.getState().app.scrollY;
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * sx, dpr * sy);
      for (const peer of peersRef.current) {
        if (!peer.ink || peer.ink.points.length < 2) continue;
        const outline = getStroke(
          peer.ink.points.map((p) => [p[0], p[1], 0.5]),
          { size: 4, thinning: 0.5, smoothing: 0.6, streamline: 0.5, last: true },
        );
        if (!outline.length) continue;
        ctx.beginPath();
        ctx.moveTo(outline[0][0] + peer.ink.origin[0], outline[0][1] + peer.ink.origin[1]);
        for (let i = 1; i < outline.length; i++) {
          ctx.lineTo(outline[i][0] + peer.ink.origin[0], outline[i][1] + peer.ink.origin[1]);
        }
        ctx.closePath();
        ctx.fillStyle = peer.color;
        ctx.globalAlpha = 0.85;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    };

    const request = () => {
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(paint);
    };
    request();
    const id = setInterval(request, 240);
    return () => {
      clearInterval(id);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, peers, appZoom, scrollX, scrollY]);

  const visible = useMemo(
    () => peers.filter((p) => p.cursor || p.selection.length || p.ink),
    [peers],
  );

  if (!enabled) return null;

  return (
    <div className="live-layer" aria-hidden>
      <canvas ref={canvasRef} className="live-ink-canvas" />
      {visible.map((peer) => {
        const [cx, cy] = peer.cursor ?? [0, 0];
        const left = cx * appZoom + scrollX;
        const top = cy * appZoom + scrollY;
        return (
          <div key={peer.id} className="live-peer" style={{ opacity: peer.cursor ? 1 : 0.55 }}>
            {peer.selection.map((r, i) => (
              <div
                key={i}
                className="live-selection"
                style={{
                  left: r.x * appZoom + scrollX,
                  top: r.y * appZoom + scrollY,
                  width: r.width * appZoom,
                  height: r.height * appZoom,
                  borderColor: peer.color,
                  background: `${peer.color}14`,
                }}
              />
            ))}
            {peer.cursor && (
              <div className="live-cursor" style={{ transform: `translate(${left}px, ${top}px)` }}>
                <svg width="22" height="22" viewBox="0 0 20 20">
                  <path
                    d={iconFor(peer.tool)}
                    fill={peer.color}
                    stroke="#fff"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="live-name" style={{ background: peer.color }} title={`${peer.name} · ${peer.tool}`}>
                  {peer.name}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
