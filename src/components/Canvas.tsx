import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBoard, createElement } from '../store/board';
import type {
  AppState,
  BoardElement,
  FreedrawElement,
  ImageElement,
  LinearElement,
  ShapeElement,
  StickyElement,
  TextElement,
} from '../types';
import {
  clamp,
  distanceToElement,
  elementBounds,
  elementsInRadius,
  fontStack,
  hitTest,
  nanoid,
  normalizeBounds,
  pointInBounds,
  wrapText,
} from '../utils/geometry';
import { renderScene } from '../scene/renderer';
import { boundsOfSelection, edgePoint, hydrateArrows, nearestBindable } from '../utils/bind';
import ContextMenu, { type MenuState } from './ContextMenu';
import { blobToDataUrl, renderToCanvas } from '../utils/export';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'rotate';

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number; scrollX: number; scrollY: number; moved: boolean }
  | {
      kind: 'draw';
      el: BoardElement;
      originX: number;
      originY: number;
      startScene: [number, number];
      lastScene: [number, number];
      startBinding: string | null;
    }
  | { kind: 'select'; x0: number; y0: number; x1: number; y1: number; additive: boolean }
  | {
      kind: 'move';
      startScene: [number, number];
      originals: Map<string, BoardElement>;
      moved: boolean;
      recorded: boolean;
      axis: 'x' | 'y' | null;
    }
  | {
      kind: 'resize';
      handle: Handle;
      startScene: [number, number];
      box: { x: number; y: number; width: number; height: number };
      originals: Map<string, BoardElement>;
      recorded: boolean;
    }
  | {
      kind: 'rotate';
      center: [number, number];
      startAngle: number;
      originals: Map<string, BoardElement>;
    }
  | { kind: 'erase'; ids: Set<string> }
  | { kind: 'laser' }
  | { kind: 'pinch'; distance: number; zoom: number; center: [number, number]; scroll: [number, number] };

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 24;
const HANDLE_SIZE = 8;

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const interaction = useRef<Interaction>({ kind: 'none' });
  const rafRef = useRef<number | null>(null);
  const needsRender = useRef(true);
  const spaceRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cursor, setCursor] = useState('default');
  // Editing lives in a ref so drawing never works off a stale closure: a text
  // box can be created and edited within the same event.
  const editingRef = useRef<{ id: string; value: string } | null>(null);
  const [editing, setEditingState] = useState<{ id: string; value: string } | null>(null);
  const setEditing = useCallback((v: { id: string; value: string } | null) => {
    editingRef.current = v;
    setEditingState(v);
  }, []);
  const [snapLines, setSnapLines] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const pointerId = useRef<number | null>(null);
  const pendingSelection = useRef<string[] | null>(null);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());

  const store = useBoard;
  const tool = useBoard((s) => s.app.tool);
  const zoom = useBoard((s) => s.app.zoom);
  const selectionCount = useBoard((s) => s.app.selection.length);

  const elementsRef = useRef(useBoard.getState().elements);
  const appRef = useRef(useBoard.getState().app);

  const drawRef = useRef<() => void>(() => {});
  const requestRender = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      drawRef.current();
    });
  }, []);


  const scenePoint = useCallback((clientX: number, clientY: number): [number, number] => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const a = appRef.current;
    if (!rect) return [0, 0];
    return [(clientX - rect.left - a.scrollX) / a.zoom, (clientY - rect.top - a.scrollY) / a.zoom];
  }, []);

  /* ----------------------------- render ---------------------------- */
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const a = appRef.current;
    const els = elementsRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
    }
    const ordered = [...els].sort((p, q) => (p.index ?? 0) - (q.index ?? 0));
    renderScene(
      ctx,
      ordered,
      { zoom: a.zoom, scrollX: a.scrollX, scrollY: a.scrollY, width: w, height: h, pixelRatio: dpr },
      {
        theme: a.theme,
        selectionColor: '#6d5efc',
        onImageLoad: requestRender,
        pattern: a.backgroundPattern,
      },
    );
    // ------------- overlays in screen space -------------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sel = els.filter((el) => a.selection.includes(el.id));
    if (sel.length) {
      const box = boundsOfSelection(sel);
      if (box) {
        const x = box.x * a.zoom + a.scrollX;
        const y = box.y * a.zoom + a.scrollY;
        const bw = box.width * a.zoom;
        const bh = box.height * a.zoom;
        if (sel.length === 1) {
          ctx.strokeStyle = 'rgba(109,94,252,0.85)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, bh + 1);
        } else {
          ctx.strokeStyle = 'rgba(109,94,252,0.5)';
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 1;
          ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, bh + 1);
          ctx.setLineDash([]);
          for (const el of sel) {
            const b = elementBounds(el);
            ctx.strokeStyle = 'rgba(109,94,252,0.4)';
            ctx.strokeRect(b.x * a.zoom + a.scrollX, b.y * a.zoom + a.scrollY, b.width * a.zoom, b.height * a.zoom);
          }
          ctx.strokeStyle = 'rgba(109,94,252,0.85)';
          ctx.strokeRect(x - 0.5, y - 0.5, bw + 1, bh + 1);
        }
        const locked = sel.every((s) => s.locked);
        if (!locked && sel.length >= 1) {
          const hs = HANDLE_SIZE;
          const pts: [number, number][] = [
            [x, y],
            [x + bw / 2, y],
            [x + bw, y],
            [x + bw, y + bh / 2],
            [x + bw, y + bh],
            [x + bw / 2, y + bh],
            [x, y + bh],
            [x, y + bh / 2],
          ];
          for (const [hx, hy] of pts) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#6d5efc';
            ctx.lineWidth = 1.5;
            roundRect(ctx, hx - hs / 2, hy - hs / 2, hs, hs, 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(x + bw / 2, y - 26, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#6d5efc';
          ctx.fill();
          ctx.strokeStyle = 'rgba(109,94,252,0.45)';
          ctx.beginPath();
          ctx.moveTo(x + bw / 2, y - 22);
          ctx.lineTo(x + bw / 2, y);
          ctx.stroke();
        }
      }
    }

    // selection marquee
    const it = interaction.current;
    if (it.kind === 'select') {
      const x = Math.min(it.x0, it.x1) * a.zoom + a.scrollX;
      const y = Math.min(it.y0, it.y1) * a.zoom + a.scrollY;
      const w2 = Math.abs(it.x1 - it.x0) * a.zoom;
      const h2 = Math.abs(it.y1 - it.y0) * a.zoom;
      ctx.fillStyle = 'rgba(109,94,252,0.10)';
      ctx.strokeStyle = 'rgba(109,94,252,0.8)';
      ctx.lineWidth = 1;
      ctx.fillRect(x, y, w2, h2);
      ctx.strokeRect(x + 0.5, y + 0.5, w2, h2);
    }

    // snap guides
    if (snapLines.x.length || snapLines.y.length) {
      ctx.strokeStyle = 'rgba(255,86,158,0.9)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      for (const gx of snapLines.x) {
        const px = gx * a.zoom + a.scrollX;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
        ctx.stroke();
      }
      for (const gy of snapLines.y) {
        const py = gy * a.zoom + a.scrollY;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // eraser ring
    if (a.tool === 'eraser' && lastPointer.current) {
      const [px, py] = lastPointer.current;
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,107,107,0.9)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(px, py, 14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,107,107,0.10)';
      ctx.fill();
    }

    // laser pointer
    if (a.laser && a.laser.points.length) {
      const pts = a.laser.points;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < pts.length; i++) {
        const alpha = i / pts.length;
        ctx.strokeStyle = `rgba(255,60,120,${0.15 + alpha * 0.75})`;
        ctx.lineWidth = 2 + alpha * 3;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0] * a.zoom + a.scrollX, pts[i - 1][1] * a.zoom + a.scrollY);
        ctx.lineTo(pts[i][0] * a.zoom + a.scrollX, pts[i][1] * a.zoom + a.scrollY);
        ctx.stroke();
      }
      const head = pts[pts.length - 1];
      ctx.beginPath();
      ctx.arc(head[0] * a.zoom + a.scrollX, head[1] * a.zoom + a.scrollY, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,120,0.95)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(head[0] * a.zoom + a.scrollX, head[1] * a.zoom + a.scrollY, 11, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,60,120,0.18)';
      ctx.fill();
    }
  }, [requestRender, snapLines]);

  drawRef.current = draw;

  const lastPointer = useRef<[number, number] | null>(null);

  useEffect(() => {
    const sync = () => {
      const st = useBoard.getState();
      appRef.current = st.app;
      elementsRef.current = st.elements;
    };
    sync();
    const unsub = useBoard.subscribe((s, prev) => {
      if (s.elements !== prev.elements || s.app !== prev.app) {
        appRef.current = s.app;
        elementsRef.current = s.elements;
        needsRender.current = true;
        requestRender();
      }
    });
    requestRender();
    return unsub;
  }, [requestRender]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
      requestRender();
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [requestRender]);

  /* --------------------------- helpers ---------------------------- */
  const setApp = useBoard((s) => s.setApp);

  const expandSelection = useCallback((ids: string[]) => {
    const els = elementsRef.current;
    const groups = new Set(
      els.filter((e) => ids.includes(e.id) && e.groupId).map((e) => e.groupId as string),
    );
    if (!groups.size) return ids;
    const out = new Set(ids);
    for (const el of els) if (el.groupId && groups.has(el.groupId)) out.add(el.id);
    return [...out];
  }, []);

  const attachedText = useCallback((id: string) => {
    return elementsRef.current.filter(
      (e) => (e as TextElement).containerId === id || (e as LinearElement).startBinding === id || (e as LinearElement).endBinding === id,
    );
  }, []);

  function handleAt(sx: number, sy: number, a: AppState, selectionOverride?: string[]): Handle | null {
    const el = selectionOverride ?? a.selection;
    if (!el.length) return null;
    const els = elementsRef.current;
    const picked = els.filter((e) => el.includes(e.id));
    if (!picked.length) return null;
    const anyLocked = picked.every((e) => e.locked);
    if (anyLocked) return null;
    const box = boundsOfSelection(picked);
    if (!box) return null;
    const x = box.x * a.zoom + a.scrollX;
    const y = box.y * a.zoom + a.scrollY;
    const w = box.width * a.zoom;
    const h = box.height * a.zoom;
    // generous screen-space targets so thin/tiny elements stay grabbable on touch
    const r = 12;
    const hits: [Handle, number, number][] = [
      ['nw', x, y],
      ['n', x + w / 2, y],
      ['ne', x + w, y],
      ['e', x + w, y + h / 2],
      ['se', x + w, y + h],
      ['s', x + w / 2, y + h],
      ['sw', x, y + h],
      ['w', x, y + h / 2],
    ];
    // rotation handle sits above the box with a larger touch target
    if (Math.hypot(sx - (x + w / 2), sy - (y - 26)) <= Math.max(r + 2, 14)) return 'rotate';
    for (const [name, hx, hy] of hits) {
      if (Math.abs(sx - hx) <= r && Math.abs(sy - hy) <= r) return name;
    }
    return null;
  }

  /* ------------------------- text editing -------------------------- */
  const startEditing = useCallback(
    (el: BoardElement) => {
      const textEl = el as TextElement | StickyElement;
      setEditing({ id: el.id, value: textEl.text ?? '' });
      setApp({ editingId: el.id });
    },
    [setApp, setEditing],
  );

  const commitEditing = useCallback(
    (value: string) => {
      const id = editingRef.current?.id;
      setEditing(null);
      if (!id) return;
      const st = store.getState();
      const el = st.elements.find((e) => e.id === id);
      st.setApp({ editingId: null });
      if (!el) return;
      if (!value.trim()) {
        if (el.type === 'text' && !(el as TextElement).containerId) {
          st.replaceElements((els) => els.filter((e) => e.id !== id), false);
        } else {
          st.updateElement(id, { text: '' } as Partial<BoardElement>);
        }
        return;
      }
      st.updateElement(id, { text: value } as Partial<BoardElement>);
    },
    [setEditing, store],
  );

  useEffect(() => {
    if (!editing) return;
    const el = elementsRef.current.find((e) => e.id === editing.id);
    if (!el) return;
    const ta = document.getElementById('inline-editor') as HTMLTextAreaElement | null;
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  }, [editing?.id]);

  /* --------------------------- pointer ---------------------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    if (menu) setMenu(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (editingRef.current) {
      commitEditing(editingRef.current.value);
      return;
    }
    const a = appRef.current;
    const [sx, sy] = [e.clientX, e.clientY];
    const scene = scenePoint(sx, sy);
    pointers.current.set(e.pointerId, { x: sx, y: sy });
    canvas.setPointerCapture(e.pointerId);
    pointerId.current = e.pointerId;
    lastPointer.current = [sx, sy];

    if (pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const rect = canvas.getBoundingClientRect();
      const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
      interaction.current = {
        kind: 'pinch',
        distance: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
        zoom: a.zoom,
        center: [cx, cy],
        scroll: [a.scrollX, a.scrollY],
      };
      return;
    }

    const isPanMode =
      a.tool === 'hand' || spaceRef.current || e.button === 1 || (e.button === 0 && e.altKey && a.tool === 'select');
    if (isPanMode) {
      interaction.current = {
        kind: 'pan',
        startX: sx,
        startY: sy,
        scrollX: a.scrollX,
        scrollY: a.scrollY,
        moved: false,
      };
      setCursor('grabbing');
      return;
    }

    if (e.button === 2) return;

    // eraser
    if (a.tool === 'eraser') {
      interaction.current = { kind: 'erase', ids: new Set() };
      eraseAt(scene[0], scene[1]);
      return;
    }

    if (a.tool === 'laser') {
      interaction.current = { kind: 'laser' };
      setApp({ laser: { points: [scene], t: Date.now() } });
      return;
    }

    // shape / draw tools
    if (['rectangle', 'diamond', 'ellipse', 'arrow', 'line'].includes(a.tool)) {
      const type = a.tool as 'rectangle' | 'diamond' | 'ellipse' | 'arrow' | 'line';
      const el = createElement({ type, x: scene[0], y: scene[1], width: 0, height: 0, app: a });
      if (type === 'rectangle' || type === 'diamond' || type === 'ellipse') {
        (el as ShapeElement).backgroundColor = a.backgroundColor;
      }
      const st = store.getState();
      st.pushHistory(`draw ${type}`);
      store.setState({ elements: [...st.elements, el] });
      interaction.current = {
        kind: 'draw',
        el,
        originX: scene[0],
        originY: scene[1],
        startScene: scene,
        lastScene: scene,
        startBinding: null,
      };
      requestRender();
      return;
    }

    if (a.tool === 'pen' || a.tool === 'pencil' || a.tool === 'highlighter') {
      const tool = a.tool;
      const el = createElement({ type: 'freedraw', x: scene[0], y: scene[1], width: 0, height: 0, app: a }) as FreedrawElement;
      el.drawTool = tool;
      el.strokeWidth = tool === 'pencil' ? Math.max(1, a.strokeWidth * 0.7) : tool === 'highlighter' ? Math.max(6, a.strokeWidth * 3) : a.strokeWidth;
      el.opacity = tool === 'highlighter' ? 0.9 : a.opacity;
      el.simulatePressure = e.pointerType !== 'pen';
      el.points = [[0, 0]];
      el.pressures = [e.pressure > 0 ? e.pressure : 0.5];
      const st = store.getState();
      st.pushHistory('draw');
      store.setState({ elements: [...st.elements, el] });
      interaction.current = {
        kind: 'draw',
        el,
        originX: scene[0],
        originY: scene[1],
        startScene: scene,
        lastScene: scene,
        startBinding: null,
      };
      requestRender();
      return;
    }

    if (a.tool === 'text') {
      const el = createElement({
        type: 'text',
        x: scene[0],
        y: scene[1] - a.fontSize / 2,
        width: 320,
        height: a.fontSize * 1.4,
        app: a,
        text: '',
      }) as TextElement;
      const st = store.getState();
      st.pushHistory('text');
      store.setState({ elements: [...st.elements, el], app: { ...st.app, selection: [el.id] } });
      setEditing({ id: el.id, value: '' });
      setApp({ tool: a.lockTool ? 'text' : 'select' });
      return;
    }

    if (a.tool === 'sticky') {
      const el = createElement({
        type: 'sticky',
        x: scene[0] - 90,
        y: scene[1] - 70,
        width: 180,
        height: 140,
        app: a,
        text: '',
      }) as StickyElement;
      const st = store.getState();
      st.pushHistory('sticky');
      store.setState({ elements: [...st.elements, el], app: { ...st.app, selection: [el.id] } });
      setEditing({ id: el.id, value: '' });
      setApp({ tool: a.lockTool ? 'sticky' : 'select' });
      return;
    }

    if (a.tool === 'frame') {
      const el = createElement({ type: 'frame', x: scene[0], y: scene[1], width: 0, height: 0, app: a });
      const st = store.getState();
      st.pushHistory('frame');
      store.setState({ elements: [...st.elements, el] });
      interaction.current = {
        kind: 'draw',
        el,
        originX: scene[0],
        originY: scene[1],
        startScene: scene,
        lastScene: scene,
        startBinding: null,
      };
      return;
    }

    // ---------- select tool ----------
    // A freshly drawn element is selected in the same pointer-down, so the app
    // state hasn't re-rendered yet — fall back to the pending selection.
    const effectiveSelection = pendingSelection.current ?? a.selection;
    const canvasRect = canvas.getBoundingClientRect();
    const handle = handleAt(sx - canvasRect.left, sy - canvasRect.top, a, effectiveSelection);
    pendingSelection.current = null;
    const picked = elementsRef.current.filter((el) => effectiveSelection.includes(el.id));
    if (handle && picked.length) {
      const originals = new Map(picked.map((el) => [el.id, { ...el }]));
      const box = boundsOfSelection(picked)!;
      if (handle === 'rotate') {
        const center: [number, number] = [box.x + box.width / 2, box.y + box.height / 2];
        interaction.current = {
          kind: 'rotate',
          center,
          startAngle: Math.atan2(scene[1] - center[1], scene[0] - center[0]),
          originals,
        };
      } else {
        interaction.current = { kind: 'resize', handle, startScene: scene, box, originals, recorded: false };
      }
      setCursor(handle === 'rotate' ? 'grabbing' : 'nwse-resize');
      return;
    }

    const hit = hitTest(scene[0], scene[1], elementsRef.current.filter((el) => el.type !== 'frame'), a.zoom);
    if (hit) {
      const ids = expandSelection([hit.id]);
      const already = hit.id && effectiveSelection.includes(hit.id);
      const nextSel = e.shiftKey
        ? already
          ? effectiveSelection.filter((id) => id !== hit.id)
          : [...effectiveSelection, ...ids.filter((id) => !effectiveSelection.includes(id))]
        : already
          ? a.selection
          : ids;
      setApp({ selection: nextSel, tool: 'select' });
      pendingSelection.current = nextSel;
      if (e.shiftKey) {
        pendingSelection.current = null;
        return; // shift-click only toggles selection
      }
      if (hit.locked) return;
      const moving = elementsRef.current.filter((el) => nextSel.includes(el.id) && !el.locked);
      const originals = new Map(moving.map((el) => [el.id, { ...el }]));
      // bring arrow children along
      for (const id of moving.map((m) => m.id)) {
        for (const child of attachedText(id)) {
          if (!originals.has(child.id)) originals.set(child.id, { ...child });
        }
      }
      interaction.current = {
        kind: 'move',
        recorded: false,
        startScene: scene,
        originals,
        moved: false,
        axis: e.shiftKey ? 'x' : null,
      };
      setCursor('move');
      return;
    }

    // click on empty canvas clears the selection
    if (!e.shiftKey) {
      setApp({ selection: [] });
      pendingSelection.current = [];
    }
    interaction.current = {
      kind: 'select',
      x0: scene[0],
      y0: scene[1],
      x1: scene[0],
      y1: scene[1],
      additive: e.shiftKey,
    };
    requestRender();
  };

  const eraseAt = (x: number, y: number) => {
    const it = interaction.current;
    if (it.kind !== 'erase') return;
    const a = appRef.current;
    const radius = 9 / a.zoom;
    const hits = elementsInRadius(x, y, radius, elementsRef.current).filter((el) => !it.ids.has(el.id));
    if (!hits.length) return;
    for (const h of hits) it.ids.add(h.id);
    const st = store.getState();
    if (!st.history.length || st.history[st.history.length - 1].label !== 'erase') {
      st.pushHistory('erase');
    }
    const ids = new Set(hits.map((h) => h.id));
    store.setState({
      elements: elementsRef.current.filter((el) => !ids.has(el.id)),
      dirty: true,
    });
    requestRender();
  };

  const hoverHandle = (sx: number, sy: number, a: AppState) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const handle = handleAt(sx - rect.left, sy - rect.top, a);
    if (handle) {
      const map: Record<string, string> = {
        nw: 'nwse-resize',
        se: 'nwse-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        rotate: 'grab',
      };
      setCursor(map[handle]);
      return;
    }
    if (a.tool === 'select') {
      const scene = scenePoint(sx, sy);
      const hit = hitTest(scene[0], scene[1], elementsRef.current.filter((el) => el.type !== 'frame'), a.zoom);
      setCursor(hit ? 'move' : 'default');
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    lastPointer.current = [e.clientX, e.clientY];
    const a = appRef.current;
    const scene = scenePoint(e.clientX, e.clientY);
    let it = interaction.current;

    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (it.kind === 'none') {
      hoverHandle(e.clientX, e.clientY, a);
      if (a.tool === 'eraser') requestRender();
      return;
    }

    if (it.kind === 'pinch' && pointers.current.size === 2) {
      const pts = [...pointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const nextZoom = clamp((it.zoom * dist) / Math.max(it.distance, 1), MIN_ZOOM, MAX_ZOOM);
      const rect = canvasRef.current!.getBoundingClientRect();
      const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
      const sceneX = (cx - it.scroll[0]) / it.zoom;
      const sceneY = (cy - it.scroll[1]) / it.zoom;
      setApp({
        zoom: nextZoom,
        scrollX: cx - sceneX * nextZoom,
        scrollY: cy - sceneY * nextZoom,
      });
      return;
    }

    if (it.kind === 'pan') {
      const dx = e.clientX - it.startX;
      const dy = e.clientY - it.startY;
      if (Math.abs(dx) + Math.abs(dy) > 2) it.moved = true;
      setApp({ scrollX: it.scrollX + dx, scrollY: it.scrollY + dy });
      return;
    }

    if (it.kind === 'laser') {
      const pts = [...(a.laser?.points ?? []), scene].slice(-60);
      setApp({ laser: { points: pts, t: Date.now() } });
      return;
    }

    if (it.kind === 'erase') {
      eraseAt(scene[0], scene[1]);
      return;
    }

    if (it.kind === 'draw') {
      const el = it.el;
      if (el.type === 'freedraw') {
        const free = el as FreedrawElement;
        const dx = scene[0] - it.originX;
        const dy = scene[1] - it.originY;
        const lastPt = free.points[free.points.length - 1];
        if (Math.hypot(dx - lastPt[0], dy - lastPt[1]) * a.zoom < 1.1) return;
        const next: FreedrawElement = {
          ...free,
          points: [...free.points, [dx, dy]],
          pressures: [...free.pressures, e.pressure > 0 ? e.pressure : 0.5],
        };
        const b = boundsOfSelection([{ ...next, x: it.originX, y: it.originY } as BoardElement]);
        void b;
        next.width = dx;
        next.height = dy;
        interaction.current = { ...it, el: next, lastScene: scene };
        store.setState({
          elements: elementsRef.current.map((x) => (x.id === el.id ? next : x)),
        });
        return;
      }
      if (el.type === 'arrow' || el.type === 'line') {
        const lin = el as LinearElement;
        const target = nearestBindable(elementsRef.current, scene[0], scene[1], a.zoom, [el.id]);
        let endX = scene[0] - it.originX;
        let endY = scene[1] - it.originY;
        if (target) {
          const [ex, ey] = edgePoint(target, it.originX, it.originY);
          endX = ex - it.originX;
          endY = ey - it.originY;
        }
        if (e.shiftKey) {
          const ang = Math.atan2(endY, endX);
          const snapped = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
          const len = Math.hypot(endX, endY);
          endX = Math.cos(snapped) * len;
          endY = Math.sin(snapped) * len;
        }
        const next: LinearElement = {
          ...lin,
          points: [lin.points[0], [endX, endY]],
          endBinding: target?.id ?? null,
          width: endX,
          height: endY,
        };
        interaction.current = { ...it, el: next, lastScene: scene };
        store.setState({ elements: elementsRef.current.map((x) => (x.id === el.id ? next : x)) });
        return;
      }
      // shape drag
      let w = scene[0] - it.originX;
      let h = scene[1] - it.originY;
      if (e.shiftKey) {
        const m = Math.max(Math.abs(w), Math.abs(h));
        w = Math.sign(w || 1) * m;
        h = Math.sign(h || 1) * m;
      }
      const next = {
        ...el,
        x: w < 0 ? it.originX + w : it.originX,
        y: h < 0 ? it.originY + h : it.originY,
        width: Math.abs(w),
        height: Math.abs(h),
      } as BoardElement;
      interaction.current = { ...it, el: next, lastScene: scene };
      store.setState({ elements: elementsRef.current.map((x) => (x.id === el.id ? next : x)) });
      return;
    }

    if (it.kind === 'select') {
      interaction.current = { ...it, x1: scene[0], y1: scene[1] };
      requestRender();
      return;
    }

    if (it.kind === 'move') {
      const moveIt = it;
      let dx = scene[0] - moveIt.startScene[0];
      let dy = scene[1] - moveIt.startScene[1];
      if (Math.hypot(dx, dy) * a.zoom < 2 && !moveIt.moved) {
        return;
      }
      if (!moveIt.recorded) {
        store.getState().pushHistory('move');
        interaction.current = { ...moveIt, recorded: true };
      }
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      // snap to other elements' edges/centers
      const movingIds = new Set(moveIt.originals.keys());
      const others = elementsRef.current.filter((el) => !movingIds.has(el.id) && el.type !== 'frame');
      const guides: { x: number[]; y: number[] } = { x: [], y: [] };
      if (!e.altKey && others.length) {
        const primary = [...moveIt.originals.values()][0];
        const pb = elementBounds(primary);
        const targetXs = new Set<number>();
        const targetYs = new Set<number>();
        for (const o of others) {
          const b = elementBounds(o);
          targetXs.add(b.x);
          targetXs.add(b.x + b.width / 2);
          targetXs.add(b.x + b.width);
          targetYs.add(b.y);
          targetYs.add(b.y + b.height / 2);
          targetYs.add(b.y + b.height);
        }
        const candX = [pb.x + dx, pb.x + pb.width / 2 + dx, pb.x + pb.width + dx];
        const candY = [pb.y + dy, pb.y + pb.height / 2 + dy, pb.y + pb.height + dy];
        const tol = 8 / a.zoom;
        let bestDx = 0;
        let bestDdx = tol;
        for (const cx of candX) {
          for (const tx of targetXs) {
            if (Math.abs(cx - tx) < bestDdx) {
              bestDdx = Math.abs(cx - tx);
              bestDx = tx - cx;
            }
          }
        }
        let bestDy = 0;
        let bestDdy = tol;
        for (const cy of candY) {
          for (const ty of targetYs) {
            if (Math.abs(cy - ty) < bestDdy) {
              bestDdy = Math.abs(cy - ty);
              bestDy = ty - cy;
            }
          }
        }
        if (Math.abs(bestDx) < tol) {
          dx += bestDx;
          guides.x.push(Math.round(pb.x + dx));
        }
        if (Math.abs(bestDy) < tol) {
          dy += bestDy;
          guides.y.push(Math.round(pb.y + dy));
        }
      }
      if (a.snapToGrid) {
        const primary = [...moveIt.originals.values()][0];
        const pb = elementBounds(primary);
        dx = Math.round((pb.x + dx) / a.gridSize) * a.gridSize - pb.x;
        dy = Math.round((pb.y + dy) / a.gridSize) * a.gridSize - pb.y;
      }
      setSnapLines(guides);
      const ids = new Set(moveIt.originals.keys());
      const nextEls = elementsRef.current.map((el) => {
        const orig = moveIt.originals.get(el.id);
        if (!orig || !ids.has(el.id)) return el;
        const moved = { ...el, x: orig.x + dx, y: orig.y + dy } as BoardElement;
        const text = orig as TextElement;
        if (el.type === 'text' && text.containerId) {
          const container = moveIt.originals.get(text.containerId);
          if (container) return { ...moved, x: container.x + dx + (text.x - container.x) } as BoardElement;
        }
        return moved;
      });
      interaction.current = { ...moveIt, recorded: true, moved: true };
      store.setState({ elements: nextEls });
      return;
    }

    if (it.kind === 'resize') {
      const resizeIt = it;
      if (!resizeIt.recorded) {
        store.getState().pushHistory('resize');
        interaction.current = { ...resizeIt, recorded: true };
      }
      const box = resizeIt.box;
      const dx = scene[0] - resizeIt.startScene[0];
      const dy = scene[1] - resizeIt.startScene[1];
      let nx = box.x;
      let ny = box.y;
      let nw = box.width;
      let nh = box.height;
      const h = resizeIt.handle;
      if (h.includes('w')) {
        nx = box.x + dx;
        nw = box.width - dx;
      }
      if (h.includes('e')) nw = box.width + dx;
      if (h.includes('n')) {
        ny = box.y + dy;
        nh = box.height - dy;
      }
      if (h.includes('s')) nh = box.height + dy;
      if (e.shiftKey && box.width && box.height) {
        const ratio = box.width / box.height;
        if (h === 'n' || h === 's') nw = nh * ratio;
        else nh = nw / ratio;
        if (h.includes('w')) nx = box.x + box.width - nw;
        if (h.includes('n')) ny = box.y + box.height - nh;
      }
      if (Math.abs(nw) < 2) nw = Math.sign(nw || 1) * 2;
      if (Math.abs(nh) < 2) nh = Math.sign(nh || 1) * 2;
      const sx = box.width ? nw / box.width : 1;
      const sy = box.height ? nh / box.height : 1;
      void sx;
      void sy;
      const ids = new Set(it.originals.keys());
      const nextEls = elementsRef.current.map((el) => {
        const orig = it.originals.get(el.id);
        if (!orig || !ids.has(el.id)) return el;
        const ob = elementBounds(orig);
        const relX = ob.x - box.x;
        const relY = ob.y - box.y;
        const newX = nx + relX * sx;
        const newY = ny + relY * sy;
        const base: BoardElement = {
          ...el,
          x: newX,
          y: newY,
          width: Math.abs(orig.width || ob.width) * Math.abs(sx),
          height: Math.abs(orig.height || ob.height) * Math.abs(sy),
        };
        if (orig.type === 'freedraw') {
          const f = orig as FreedrawElement;
          const fw = Math.abs(f.width) || 1;
          const fh = Math.abs(f.height) || 1;
          (base as FreedrawElement).points = f.points.map((p) => [p[0] * Math.abs(sx), p[1] * Math.abs(sy)]);
          void fw;
          void fh;
        }
        if (orig.type === 'arrow' || orig.type === 'line') {
          const l = orig as LinearElement;
          (base as LinearElement).points = l.points.map((p) => [p[0] * Math.abs(sx), p[1] * Math.abs(sy)]);
        }

        if (orig.type === 'sticky') {
          (base as StickyElement).fontSize = Math.max(8, (orig as StickyElement).fontSize * Math.min(Math.abs(sx), Math.abs(sy)));
        }
        return base;
      });
      store.setState({ elements: hydrateArrows(nextEls) });
      return;
    }

    if (it.kind === 'rotate') {
      const angle = Math.atan2(scene[1] - it.center[1], scene[0] - it.center[0]);
      let delta = angle - it.startAngle;
      if (e.shiftKey) delta = Math.round(delta / (Math.PI / 12)) * (Math.PI / 12);
      const ids = new Set(it.originals.keys());
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      const nextEls = elementsRef.current.map((el) => {
        const orig = it.originals.get(el.id);
        if (!orig || !ids.has(el.id)) return el;
        const cx = orig.x + orig.width / 2;
        const cy = orig.y + orig.height / 2;
        const rx = it.center[0] + (cx - it.center[0]) * cos - (cy - it.center[1]) * sin;
        const ry = it.center[1] + (cx - it.center[0]) * sin + (cy - it.center[1]) * cos;
        return {
          ...el,
          x: rx - orig.width / 2,
          y: ry - orig.height / 2,
          angle: (orig.angle || 0) + delta,
        } as BoardElement;
      });
      store.setState({ elements: nextEls });
      return;
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const it = interaction.current;
    const a = appRef.current;
    const st = store.getState();
    if (it.kind === 'draw') {
      const el = it.el;
      const tooSmall =
        (el.type === 'rectangle' || el.type === 'ellipse' || el.type === 'diamond' || el.type === 'frame') &&
        (Math.abs(el.width) < 4 || Math.abs(el.height) < 4);
      const arrowTooSmall =
        (el.type === 'arrow' || el.type === 'line') &&
        Math.hypot((el as LinearElement).points[1][0], (el as LinearElement).points[1][1]) < 4;
      const freeTooSmall = el.type === 'freedraw' && (el as FreedrawElement).points.length < 2;
      if (tooSmall || arrowTooSmall || freeTooSmall) {
        store.setState({ elements: elementsRef.current.filter((x) => x.id !== el.id) });
        st.undo();
      } else {
        const nextSel = [el.id];
        pendingSelection.current = nextSel;
        st.setApp({
          selection: nextSel,
          tool: a.lockTool ? a.tool : 'select',
        });
        // With a sticky tool the next gesture should draw again, not grab the
        // element we just finished.
        if (a.lockTool) st.setApp({ selection: [] });
        if (el.type === 'frame') {
          const bounds = elementBounds(el);
          const inside = elementsRef.current.filter(
            (x) => x.id !== el.id && x.index < el.index && pointInBounds(x.x + x.width / 2, x.y + x.height / 2, bounds),
          );
          if (inside.length) {
            const idSet = new Set(inside.map((x) => x.id));
            store.setState({
              elements: elementsRef.current.map((x) =>
                idSet.has(x.id) ? { ...x, index: el.index - 1000 + x.index / 100000 } : x,
              ),
            });
          }
        }
      }
      setCursor('default');
    }
    if (it.kind === 'select') {
      const bx = {
        x: Math.min(it.x0, it.x1),
        y: Math.min(it.y0, it.y1),
        width: Math.abs(it.x1 - it.x0),
        height: Math.abs(it.y1 - it.y0),
      };
      const picked = elementsRef.current.filter((el) => {
        if (el.type === 'frame') return false;
        const b = elementBounds(el);
        return b.x >= bx.x && b.y >= bx.y && b.x + b.width <= bx.x + bx.width && b.y + b.height <= bx.y + bx.height;
      });
      const ids = expandSelection(picked.map((p) => p.id));
      st.setApp({ selection: it.additive ? [...new Set([...a.selection, ...ids])] : ids });
    }
    if (it.kind === 'move') {
      if (it.moved) {
        const finalEls = hydrateArrows(elementsRef.current);
        store.setState({ elements: finalEls });
      }
      setSnapLines({ x: [], y: [] });
    }
    if (it.kind === 'resize') {
      store.setState({ elements: hydrateArrows(elementsRef.current) });
    }
    if (it.kind === 'pan') {
      if (!it.moved && a.tool === 'hand') setCursor('grab');
      else setCursor(a.tool === 'select' ? 'default' : 'crosshair');
    }
    if (it.kind === 'laser') {
      const startedAt = Date.now();
      const tick = () => {
        if (Date.now() - startedAt > 420) {
          st.setApp({ laser: null });
          requestRender();
        } else requestRender();
        if (Date.now() - startedAt <= 700) requestAnimationFrame(tick);
      };
      setTimeout(() => {
        st.setApp({ laser: null });
        requestRender();
      }, 420);
      requestAnimationFrame(tick);
    }
    interaction.current = { kind: 'none' };
    setCursor(a.tool === 'hand' ? 'grab' : a.tool === 'select' ? 'default' : 'crosshair');
    requestRender();
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    if (editingRef.current) return;
    const a = appRef.current;
    const scene = scenePoint(e.clientX, e.clientY);
    const hit = hitTest(scene[0], scene[1], elementsRef.current.filter((el) => el.type !== 'frame'), a.zoom);
    if (hit) {
      if (hit.type === 'text' || hit.type === 'sticky') {
        startEditing(hit);
        return;
      }
      if (hit.type === 'rectangle' || hit.type === 'ellipse' || hit.type === 'diamond') {
        // create container text
        const existing = elementsRef.current.find(
          (x) => x.type === 'text' && (x as TextElement).containerId === hit.id,
        );
        if (existing) {
          startEditing(existing);
          return;
        }
        const b = normalizeBounds(hit);
        const st = store.getState();
        const el = createElement({
          type: 'text',
          x: b.x + 12,
          y: b.y + 8,
          width: Math.max(40, b.width - 24),
          height: Math.max(20, b.height - 16),
          app: { ...a, textAlign: 'center', fontSize: Math.min(a.fontSize, 28) },
          text: '',
        }) as TextElement;
        el.containerId = hit.id;
        el.verticalAlign = 'middle';
        el.strokeColor = a.theme === 'dark' ? '#f2f2f7' : '#1e1e28';
        el.index = hit.index + 0.5;
        st.pushHistory('text');
        store.setState({ elements: [...st.elements, el] });
        setEditing({ id: el.id, value: '' });
      }
      return;
    }
    // empty double click creates text
    const el = createElement({
      type: 'text',
      x: scene[0],
      y: scene[1] - a.fontSize / 2,
      width: 320,
      height: a.fontSize * 1.3,
      app: a,
      text: '',
    }) as TextElement;
    const st = store.getState();
    st.pushHistory('text');
    store.setState({ elements: [...st.elements, el], app: { ...st.app, selection: [el.id] } });
    setEditing({ id: el.id, value: '' });
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const a = appRef.current;
    const scene = scenePoint(e.clientX, e.clientY);
    const hit = hitTest(scene[0], scene[1], elementsRef.current.filter((el) => el.type !== 'frame'), a.zoom);
    if (hit && !a.selection.includes(hit.id)) {
      const ids = expandSelection([hit.id]);
      setApp({ selection: ids });
    }
    setMenu({ x: e.clientX, y: e.clientY, scene });
  };

  /* ---------------------------- wheel ----------------------------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const a = appRef.current;
      const rect = canvas.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const nextZoom = clamp(a.zoom * factor, MIN_ZOOM, MAX_ZOOM);
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        const sceneX = (cx - a.scrollX) / a.zoom;
        const sceneY = (cy - a.scrollY) / a.zoom;
        useBoard.getState().setApp({
          zoom: nextZoom,
          scrollX: cx - sceneX * nextZoom,
          scrollY: cy - sceneY * nextZoom,
        });
      } else {
        const dx = e.shiftKey ? e.deltaY : e.deltaX;
        const dy = e.shiftKey ? 0 : e.deltaY;
        useBoard.getState().setApp({
          scrollX: a.scrollX - dx,
          scrollY: a.scrollY - dy,
        });
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  /* ------------------------- paste / drop ------------------------- */
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const text = ev.clipboardData?.getData('text/plain') ?? '';
      const items = ev.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            ev.preventDefault();
            const file = item.getAsFile();
            if (!file) continue;
            void blobToDataUrl(file).then((src) => addImage(src));
            return;
          }
        }
      }
      // our own element clipboard wins when both are present
      const raw = localStorage.getItem('collabboard:v1:clipboard');
      if (raw) {
        try {
          const pasted = JSON.parse(raw) as BoardElement[];
          const isOurs =
            Array.isArray(pasted) &&
            pasted.length > 0 &&
            pasted.every((p) => p && typeof p === 'object' && 'seed' in p && 'index' in p);
          if (isOurs && (text === '' || text.trim().length === 0 || text.length < 4 || !text.trim())) {
            ev.preventDefault();
            useBoard.getState().paste();
            return;
          }
        } catch {
          /* not our clipboard */
        }
      }
      if (!text.trim()) return;
      const a = appRef.current;
      const rect = canvasRef.current?.getBoundingClientRect();
      const cx = (rect ? rect.width / 2 - a.scrollX : 200) / a.zoom;
      const cy = (rect ? rect.height / 2 - a.scrollY : 200) / a.zoom;
      const el = createElement({
        type: 'text',
        x: cx,
        y: cy,
        width: Math.min(640, Math.max(220, text.length * 9)),
        height: a.fontSize * 1.4,
        app: a,
        text,
      }) as TextElement;
      ev.preventDefault();
      const st = useBoard.getState();
      st.pushHistory('paste text');
      useBoard.setState({
        elements: [...st.elements, el],
        app: { ...st.app, selection: [el.id], tool: 'select' },
      });
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addImage = useCallback((src: string) => {
    const a = appRef.current;
    const img = new Image();
    img.onload = () => {
      const maxW = 420 / a.zoom;
      const ratio = Math.min(1, maxW / img.width, 420 / img.height);
      const cx = (window.innerWidth / 2 - a.scrollX) / a.zoom;
      const cy = (window.innerHeight / 2 - a.scrollY) / a.zoom;
      const w = img.width * ratio;
      const h = img.height * ratio;
      const el = createElement({ type: 'image', x: cx - w / 2, y: cy - h / 2, width: w, height: h, app: a, text: src }) as ImageElement;
      const st = useBoard.getState();
      st.pushHistory('image');
      useBoard.setState({ elements: [...st.elements, el], app: { ...st.app, selection: [el.id] } });
    };
    img.src = src;
  }, []);

  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const src = await blobToDataUrl(file);
        addImage(src);
      }
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragover', onDragOver);
    return () => {
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragover', onDragOver);
    };
  }, [addImage]);

  /* --------------------------- keyboard --------------------------- */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const a = appRef.current;
      const st = useBoard.getState();
      if (e.code === 'Space') {
        spaceRef.current = true;
        setCursor('grab');
        if (!e.repeat) e.preventDefault();
      }
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        st.redo();
        return;
      }
      if (meta && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        st.setApp({ selection: st.elements.filter((el) => !el.locked).map((el) => el.id) });
        return;
      }
      if (meta && e.key.toLowerCase() === 'c') {
        st.copySelection();
        return;
      }
      if (meta && e.key.toLowerCase() === 'v') {
        return; // handled by paste event
      }
      if (meta && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        st.duplicateSelection();
        return;
      }
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault();
        st.save();
        return;
      }
      if (meta && e.key === '0') {
        e.preventDefault();
        st.setApp({ zoom: 1 });
        return;
      }
      if (meta && ['+', '='].includes(e.key)) {
        e.preventDefault();
        st.setApp({ zoom: clamp(a.zoom * 1.2, MIN_ZOOM, MAX_ZOOM) });
        return;
      }
      if (meta && e.key === '-') {
        e.preventDefault();
        st.setApp({ zoom: clamp(a.zoom / 1.2, MIN_ZOOM, MAX_ZOOM) });
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (a.selection.length) {
          e.preventDefault();
          st.deleteSelection();
        }
        return;
      }
      if (e.key === 'Escape') {
        // Escape is the explicit way out of a sticky tool.
        const backToSelect = !['select', 'hand'].includes(a.tool);
        st.setApp({ selection: [], editingId: null, ...(backToSelect ? { tool: 'select' as const } : {}) });
        setMenu(null);
        setEditing(null);
        return;
      }
      if (meta) return;
      const map: Record<string, string> = {
        v: 'select',
        h: 'hand',
        p: 'pen',
        b: 'pencil',
        m: 'highlighter',
        e: 'eraser',
        r: 'rectangle',
        d: 'diamond',
        o: 'ellipse',
        a: 'arrow',
        l: 'line',
        t: 'text',
        n: 'sticky',
        f: 'frame',
        k: 'laser',
        i: 'image',
      };
      const tool = map[e.key.toLowerCase()];
      if (tool) {
        if (tool === 'image') {
          document.getElementById('image-input')?.click();
          return;
        }
        st.setTool(tool as never);
        return;
      }
      if (a.selection.length) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
          const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
          st.pushHistory('nudge');
          const sel = new Set(a.selection);
          useBoard.setState({
            elements: useBoard.getState().elements.map((el) => (sel.has(el.id) ? { ...el, x: el.x + dx, y: el.y + dy } : el)),
          });
        }
        if (['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) {
          const widthMap: Record<string, number> = { '1': 1, '2': 2, '3': 4, '4': 8 };
          const w = widthMap[e.key];
          if (w) {
            st.updateElements(a.selection, () => ({ strokeWidth: w }));
          }
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        setCursor(appRef.current.tool === 'hand' ? 'grab' : appRef.current.tool === 'select' ? 'default' : 'crosshair');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /* ------------------------ zoom to fit --------------------------- */
  useEffect(() => {
    const handler = () => {
      const els = elementsRef.current;
      if (!els.length) return;
      const box = boundsOfSelection(els)!;
      const w = size.width || window.innerWidth;
      const h = size.height || window.innerHeight;
      const zoom = clamp(Math.min((w - 120) / Math.max(box.width, 1), (h - 160) / Math.max(box.height, 1)), MIN_ZOOM, 4);
      setApp({
        zoom,
        scrollX: w / 2 - (box.x + box.width / 2) * zoom,
        scrollY: h / 2 - (box.y + box.height / 2) * zoom,
      });
    };
    window.addEventListener('collabboard:zoomfit', handler);
    return () => window.removeEventListener('collabboard:zoomfit', handler);
  }, [setApp, size.height, size.width]);

  const cursorFor = useMemo(() => {
    if (tool === 'hand') return 'grab';
    if (tool === 'eraser') return 'none';
    if (tool === 'select') return 'default';
    if (tool === 'text' || tool === 'sticky') return 'text';
    return 'crosshair';
  }, [tool]);

  const editingEl = useMemo(
    () => (editing ? useBoard.getState().elements.find((e) => e.id === editing.id) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editing, selectionCount],
  );
  const editingStyle = useMemo(() => {
    if (!editingEl) return null;
    const a = appRef.current;
    const zoom = a.zoom;
    const isSticky = editingEl.type === 'sticky';
    const isText = editingEl.type === 'text';
    const t = editingEl as TextElement;
    const b = normalizeBounds(editingEl);
    const x = b.x * zoom + a.scrollX;
    const y = b.y * zoom + a.scrollY;
    const fontSize = (isText ? t.fontSize : isSticky ? (editingEl as StickyElement).fontSize : 18) * zoom;
    return {
      left: x,
      top: y,
      width: Math.max(b.width * zoom, 40),
      height: Math.max(b.height * zoom, fontSize * 1.4),
      fontSize,
      fontFamily: fontStack((t.fontFamily ?? 'sans') as string),
      color: isSticky ? '#1f2430' : editingEl.strokeColor,
      textAlign: (t.textAlign ?? 'left') as 'left' | 'center' | 'right',
      lineHeight: String(t.lineHeight ?? 1.28),
      background: 'transparent',
      padding: isSticky ? '14px' : '0px',
      boxSizing: 'border-box',
    };
  }, [editingEl]);

  // auto-grow text boxes while typing (no undo entries for these tweaks)
  const measureText = useCallback((value: string) => {
    const id = editingRef.current?.id;
    if (!id) return;
    const el = useBoard.getState().elements.find((e) => e.id === id);
    if (!el || el.type !== 'text') return;
    const ctx = document.createElement('canvas').getContext('2d');
    const t = el as TextElement;
    const font = `${t.fontSize}px ${fontStack(t.fontFamily)}`;
    const lines = wrapText(ctx, value, Math.abs(t.width), font);
    const bound = t.containerId
      ? elementsRef.current.find((e) => e.id === t.containerId)
      : undefined;
    let maxW = Math.abs(t.width);
    if (!t.containerId && ctx) {
      ctx.font = font;
      const widest = Math.max(
        ...value.split('\n').map((line) => ctx.measureText(line).width),
        t.fontSize * 2,
      );
      maxW = Math.max(maxW, Math.ceil(widest) + 6);
    }
    const height = Math.max(t.fontSize * t.lineHeight * lines.length, t.fontSize * 1.4);
    const patch: Partial<BoardElement> = { text: value, height };
    if (!t.containerId) (patch as Partial<TextElement>).width = maxW;
    useBoard.getState().updateElement(id, patch);
    if (bound) {
      const bh = Math.max(height + 16, Math.abs(bound.height));
      if (bh !== Math.abs(bound.height)) useBoard.getState().updateElement(bound.id, { height: bh });
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="canvas-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      style={{ cursor: cursor || cursorFor, touchAction: 'none' }}
      onDragStart={(e) => e.preventDefault()}
    >
      <canvas ref={canvasRef} ref-role="board" style={{ width: '100%', height: '100%', display: 'block' }} />
      <div ref={stageRef} className="stage-overlay" />
      {editing && editingStyle && (
        <textarea
          id="inline-editor"
          className="inline-editor"
          value={editing.value}
          style={editingStyle as React.CSSProperties}
          onChange={(e) => {
            setEditing({ ...editing, value: e.target.value });
            measureText(e.target.value);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
          onBlur={() => commitEditing(editing.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              commitEditing(editing.value);
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              commitEditing(editing.value);
            }
            e.stopPropagation();
          }}
        />
      )}
      {menu && <ContextMenu state={menu} onClose={() => setMenu(null)} />}
      <input
        id="image-input"
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const src = await blobToDataUrl(file);
          addImage(src);
          e.target.value = '';
        }}
      />
      <div className="zoom-hud">
        <button onClick={() => setApp({ zoom: clamp(zoom / 1.15, MIN_ZOOM, MAX_ZOOM) })} title="Zoom out (Ctrl -)">
          −
        </button>
        <button className="zoom-value" onClick={() => setApp({ zoom: 1, scrollX: 0, scrollY: 0 })} title="Reset zoom (Ctrl 0)">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => setApp({ zoom: clamp(zoom * 1.15, MIN_ZOOM, MAX_ZOOM) })} title="Zoom in (Ctrl +)">
          +
        </button>
        <span className="divider" />
        <button onClick={() => window.dispatchEvent(new Event('collabboard:zoomfit'))} title="Zoom to fit (Shift 1)">
          Fit
        </button>
      </div>
    </div>
  );
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export { distanceToElement, nanoid, renderToCanvas };
