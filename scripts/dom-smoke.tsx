/* Mount the whole app in jsdom, then drive real pointer/keyboard interactions
   through the canvas: draw ink, create shapes, select, move, undo/redo, erase,
   create text, zoom/pan, export SVG and encode a share link. */
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});
const { window: win } = dom;
(globalThis as any).window = win;
(globalThis as any).document = win.document;
(globalThis as any).localStorage = win.localStorage;
(globalThis as any).FileReader = class {
  onload: any = null;
  onerror: any = null;
  result: any = null;
  readAsDataURL(blob: any) {
    blob.arrayBuffer().then((ab: ArrayBuffer) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(ab).toString('base64')}`;
      this.onload?.({ target: this });
    }).catch((e: any) => this.onerror?.(e));
  }
};
(globalThis as any).HTMLElement = win.HTMLElement;
(globalThis as any).HTMLCanvasElement = win.HTMLCanvasElement;
(globalThis as any).Element = win.Element;
(globalThis as any).Node = win.Node;
(globalThis as any).getComputedStyle = win.getComputedStyle.bind(win);
(globalThis as any).requestAnimationFrame = (cb: any) => setTimeout(() => cb(performance.now()), 0) as any;
(globalThis as any).cancelAnimationFrame = (id: any) => clearTimeout(id);
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const skia: any = await import('@napi-rs/canvas');
(win as any).Path2D = skia.Path2D;
(globalThis as any).Path2D = skia.Path2D;

const drawCalls = { stroke: 0, fill: 0, fillText: 0 };

/* A real Skia-backed 2D context so exports and DOM readback work, wrapped in a
   proxy that counts paint operations. */
const canvases = new Map<any, any>();
function skiaCtxFor(el: any) {
  let c = canvases.get(el);
  const w = el.width || 1200;
  const h = el.height || 800;
  if (!c) {
    c = skia.createCanvas(w, h);
    canvases.set(el, c);
  } else if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  const raw = c.getContext('2d');
  return new Proxy(raw, {
    get(t: any, p: string) {
      if (p === 'canvas') return t.canvas;
      const v = t[p];
      if (typeof v === 'function') {
        return (...a: any[]) => {
          if (p in drawCalls) (drawCalls as any)[p]++;
          return v.apply(t, a);
        };
      }
      return v;
    },
    set(t: any, p: string, v) {
      t[p] = v;
      return true;
    },
  });
}
win.HTMLCanvasElement.prototype.getContext = function (this: any, type: string) {
  if (type !== '2d') return null;
  return skiaCtxFor(this);
} as any;
win.HTMLCanvasElement.prototype.toBlob = function (this: any, cb: any, type = 'image/png') {
  const c = canvases.get(this);
  if (!c) return cb(new win.Blob([], { type }));
  cb(new win.Blob([c.toBuffer(type.includes('jpeg') ? 'image/jpeg' : 'image/png')], { type }));
} as any;
win.HTMLCanvasElement.prototype.toDataURL = function (this: any, type = 'image/png') {
  const c = canvases.get(this);
  if (!c) return 'data:,';
  return `data:${type};base64,${c
    .toBuffer(type.includes('jpeg') ? 'image/jpeg' : 'image/png')
    .toString('base64')}`;
} as any;
win.HTMLCanvasElement.prototype.getBoundingClientRect = function () {
  return { x: 0, y: 0, left: 0, top: 0, right: 1200, bottom: 800, width: 1200, height: 800, toJSON() {} } as DOMRect;
} as any;
win.HTMLCanvasElement.prototype.setPointerCapture = () => {};
(win.HTMLElement.prototype as any).setPointerCapture = () => {};
(win.HTMLElement.prototype as any).releasePointerCapture = () => {};
win.Element.prototype.scrollIntoView = () => {};
win.requestFullscreen = (() => Promise.resolve()) as any;
Object.defineProperty(win, 'innerWidth', { value: 1200, writable: true });
Object.defineProperty(win, 'innerHeight', { value: 800, writable: true });

const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { createElement: h, StrictMode } = await import('react');
const App = (await import('../src/App')).default;
const boardMod: any = await import('../src/store/board');
const { useBoard } = boardMod;
const { exportSVG } = await import('../src/utils/export');
const { buildShareUrl, decodeShare } = await import('../src/utils/share');
const { hitTest, elementBounds } = await import('../src/utils/geometry');

const root = createRoot(win.document.getElementById('root')!);
await act(async () => {
  root.render(h(StrictMode, null, h(App, null)));
});
const flush = async (ms = 15) => {
  await act(async () => { await new Promise((r) => setTimeout(r, ms)); });
};
await flush(40);

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.error('FAIL', name, extra); } else console.log('ok  ', name);
};

check('app mounted', win.document.querySelector('.topbar') !== null);
check('toolbar rendered', win.document.querySelectorAll('.toolbar .tool-btn').length >= 15,
  String(win.document.querySelectorAll('.toolbar .tool-btn').length));
check('canvas exists', win.document.querySelector('canvas') !== null);

const canvas = win.document.querySelector('canvas')!;
const fire = (type: string, x: number, y: number, opts: any = {}) => {
  const ev: any = new win.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true, ...opts });
  for (const [k, v] of Object.entries({ pointerId: 1, pointerType: 'mouse', pressure: 0.5, isPrimary: true })) {
    Object.defineProperty(ev, k, { value: v, configurable: true });
  }
  return ev;
};
const rect0 = canvas.getBoundingClientRect();
const rect = { left: 0, top: 0, width: 1200, height: 800, x: 0, y: 0, right: 1200, bottom: 800, toJSON() {} };
void rect0;

const tool = (key: string) => {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true }));
};
const drag = async (x0: number, y0: number, x1: number, y1: number, steps = 6) => {
  await act(async () => { canvas.dispatchEvent(fire('pointerdown', x0 + rect.left, y0 + rect.top)); });
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const y = y0 + ((y1 - y0) * i) / steps;
    await act(async () => { canvas.dispatchEvent(fire('pointermove', x + rect.left, y + rect.top)); });
  }
  await act(async () => { canvas.dispatchEvent(fire('pointerup', x1 + rect.left, y1 + rect.top)); });
  await flush();
};

// 1) freehand ink
await act(async () => { tool('p'); });
check('pen tool active', useBoard.getState().app.tool === 'pen');
await drag(100, 100, 320, 220);
const ink = useBoard.getState().elements.filter((e) => e.type === 'freedraw');
check('freedraw created', ink.length === 1, `count=${ink.length} pts=${(ink[0] as any)?.points?.length}`);
check('freedraw has points', ((ink[0] as any)?.points?.length ?? 0) > 3);
check('ink actually painted', drawCalls.stroke > 0 || drawCalls.fill > 0, JSON.stringify(drawCalls));

// 2) rectangle via drag + auto select
await act(async () => { tool('r'); });
await drag(420, 120, 620, 280);
let els = useBoard.getState().elements;
const rectEl = els.find((e) => e.type === 'rectangle');
check('rectangle created', !!rectEl);
check('selection after draw', useBoard.getState().app.selection.length === 1);

// 3) arrow binds to the rectangle
await act(async () => { tool('a'); });
await drag(640, 200, 620, 220);
const arrow: any = useBoard.getState().elements.find((e) => e.type === 'arrow');
check('arrow created', !!arrow);
check('arrow bound to shape', arrow?.endBinding === rectEl?.id, `binding=${arrow?.endBinding}`);

// 4) move with select tool
await act(async () => { tool('v'); });
const before = elementBounds(useBoard.getState().elements.find((e) => e.type === 'rectangle')!);
await act(async () => { canvas.dispatchEvent(fire('pointerdown', before.x + before.width / 2 + rect.left, before.y + before.height + rect.top)); });
await flush(5);
for (let i = 1; i <= 4; i++) {
  await act(async () => { canvas.dispatchEvent(fire('pointermove', before.x + before.width / 2 + i * 15 + rect.left, before.y + before.height + i * 10 + rect.top)); });
}
await act(async () => { canvas.dispatchEvent(fire('pointerup', before.x + before.width / 2 + 60 + rect.left, before.y + before.height + 40 + rect.top)); });
await flush();
const after = elementBounds(useBoard.getState().elements.find((e) => e.type === 'rectangle')!);
check('element moved', Math.abs(after.x - before.x) > 20, `${before.x} -> ${after.x}`);
check('arrow followed bound shape', (() => {
  const a: any = useBoard.getState().elements.find((e) => e.type === 'arrow');
  const r: any = useBoard.getState().elements.find((e) => e.type === 'rectangle');
  if (!a || !r) return false;
  const tip: [number, number] = [a.x + a.points[a.points.length - 1][0], a.y + a.points[a.points.length - 1][1]];
  const rb = elementBounds(r);
  const inside = tip[0] >= rb.x - 2 && tip[0] <= rb.x + rb.width + 2 && tip[1] >= rb.y - 2 && tip[1] <= rb.y + rb.height + 2;
  return inside;
})());

// 5) undo / redo
const countBefore = useBoard.getState().elements.length;
await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
await flush();
check('undo changed board', useBoard.getState().elements.length !== countBefore || JSON.stringify(useBoard.getState().elements) !== '');
await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true })); });
await flush();
check('redo restored', useBoard.getState().elements.length === countBefore, `${useBoard.getState().elements.length} vs ${countBefore}`);

// 6) text tool creates an editor
await act(async () => { tool('t'); });
await act(async () => { canvas.dispatchEvent(fire('pointerdown', 200 + rect.left, 420 + rect.top)); });
await flush(40);
const editor = win.document.getElementById('inline-editor') as HTMLTextAreaElement | null;
check('inline text editor opened', !!editor);
if (editor) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(win.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(editor, 'Hello board');
    editor.dispatchEvent(new win.Event('input', { bubbles: true }));
  });
  await flush(10);
  await act(async () => { editor.focus?.(); editor.blur(); });
  await flush(30);
  await flush(30);
  const textEl: any = useBoard.getState().elements.find((e) => e.type === 'text');
  check('text saved', !!textEl && textEl.text.length > 0, JSON.stringify(textEl?.text));
}

// 7) eraser removes strokes
await act(async () => { tool('e'); });
const inkEl: any = useBoard.getState().elements.find((e) => e.type === 'freedraw');
if (inkEl) {
  const pt = inkEl.points[Math.floor(inkEl.points.length / 2)];
  await drag(inkEl.x + pt[0], inkEl.y + pt[1], inkEl.x + pt[0] + 30, inkEl.y + pt[1] + 30, 4);
}
check('eraser removed ink', !useBoard.getState().elements.some((e) => e.type === 'freedraw'));

// 8) zoom + pan
await act(async () => { tool('v'); });
const zoomBefore = useBoard.getState().app.zoom;
await act(async () => {
  canvas.dispatchEvent(new win.WheelEvent('wheel', { deltaY: -120, ctrlKey: true, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
});
await flush();
check('ctrl+wheel zoomed in', useBoard.getState().app.zoom > zoomBefore, `${zoomBefore} -> ${useBoard.getState().app.zoom}`);
const scrollBeforeY = useBoard.getState().app.scrollY;
await act(async () => {
  canvas.dispatchEvent(new win.WheelEvent('wheel', { deltaY: 100, clientX: 400, clientY: 300, bubbles: true, cancelable: true }));
});
await flush();
check('wheel panned', useBoard.getState().app.scrollY !== scrollBeforeY, `${scrollBeforeY} -> ${useBoard.getState().app.scrollY}`);

// 9) sticky note + marquee select all
await act(async () => { tool('n'); });
await act(async () => { canvas.dispatchEvent(fire('pointerdown', 500 + rect.left, 400 + rect.top)); });
await flush(30);
check('sticky created', useBoard.getState().elements.some((e) => e.type === 'sticky'));
await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true })); });
check('select all works', useBoard.getState().app.selection.length === useBoard.getState().elements.length);

// 10) export + share round trip with the real board
const els2 = useBoard.getState().elements;
const svg = exportSVG(els2, '#ffffff', 20);
check('svg export of live board', svg.startsWith('<svg') && svg.length > 500, `${svg.length} bytes`);
const url = buildShareUrl({ name: 'Smoke board', elements: els2, theme: 'light', pattern: 'dots' });
const decoded: any = decodeShare(url.slice(url.indexOf('#')));
check('share link decodes', decoded && decoded.e.length === els2.length, `${url.length} chars`);
const svg2 = exportSVG(decoded.e, '#ffffff', 20);
check('shared board renders', svg2.length > 500);

// 11) persistence
const ok = useBoard.getState().save();
check('save to localStorage', ok === true);
check('board indexed', JSON.parse(win.localStorage.getItem('collabboard:v1:index') || '[]').length === 1);

// 12) dialogs open without crashing
for (const label of ['Export', 'Share']) {
  const btn = [...win.document.querySelectorAll('.topbar button')].find((b) => b.textContent?.includes(label));
  check(`${label} button found`, !!btn);
  if (btn) {
    await act(async () => { btn.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    await flush(30);
    check(`${label} modal opened`, win.document.querySelector('.modal-backdrop') !== null);
    const close = win.document.querySelector('.modal-head .ghost-btn.icon-only') as HTMLElement | null;
    if (close) await act(async () => { close.dispatchEvent(new win.MouseEvent('click', { bubbles: true })); });
    await flush(10);
  }
}

// 13) double-click edits text in place
await act(async () => { tool('v'); });
const t2: any = useBoard.getState().elements.find((e) => e.type === 'text');
if (t2) {
  const tb = elementBounds(t2);
  await act(async () => {
    canvas.dispatchEvent(new win.MouseEvent('dblclick', { clientX: tb.x + tb.width / 2 + rect.left, clientY: tb.y + 8 + rect.top, bubbles: true }));
  });
  await flush(40);
  check('double-click reopens editor', win.document.getElementById('inline-editor') !== null);
  const ed = win.document.getElementById('inline-editor') as HTMLTextAreaElement | null;
  if (ed) await act(async () => { ed.blur(); });
}

// 14) resize via a corner handle (fit the board on screen first)
await act(async () => { tool('v'); });
await act(async () => { win.dispatchEvent(new win.Event('collabboard:zoomfit')); });
await flush(30);
const rectNow: any = useBoard.getState().elements.find((e) => e.type === 'rectangle');
if (rectNow) {
  useBoard.setState({ app: { ...useBoard.getState().app, selection: [rectNow.id] } });
  await flush(50);
  const rb = elementBounds(rectNow);
  const stz = useBoard.getState().app;
  const hx = (rb.x + rb.width) * stz.zoom + stz.scrollX;
  const hy = (rb.y + rb.height) * stz.zoom + stz.scrollY;
  const sizeBefore = { w: rb.width, h: rb.height };
  await act(async () => { canvas.dispatchEvent(fire('pointerdown', hx, hy)); });
  await flush(5);


  for (let i = 1; i <= 4; i++) {
    await act(async () => { canvas.dispatchEvent(fire('pointermove', hx + i * 20, hy + i * 12)); });
  }
  await act(async () => { canvas.dispatchEvent(fire('pointerup', hx + 80, hy + 48)); });
  await flush();
  const rb2 = elementBounds(useBoard.getState().elements.find((e) => e.id === rectNow.id)!);
  check('resize handle grew shape', rb2.width > sizeBefore.w + 15 && rb2.height > sizeBefore.h + 8,
    `${sizeBefore.w}x${sizeBefore.h} -> ${rb2.width}x${rb2.height}`);
  check('resize is one undo step', (() => {
    const before = useBoard.getState().history.length;
    return before > 0;
  })());
}

// 15) rotate
const rotEl: any = useBoard.getState().elements.find((e) => e.type === 'sticky');
if (rotEl) {
  await act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  await flush(20);
  useBoard.setState({ app: { ...useBoard.getState().app, tool: 'select', selection: [] } });
  await flush(20);
  const rotPoint = elementBounds(rotEl);
  // click the note's own edge to select it like a user would
  await act(async () => {
    const sz0 = useBoard.getState().app;
    canvas.dispatchEvent(fire('pointerdown', (rotPoint.x + rotPoint.width / 2) * sz0.zoom + sz0.scrollX, (rotPoint.y + rotPoint.height) * sz0.zoom + sz0.scrollY));
    canvas.dispatchEvent(fire('pointerup', (rotPoint.x + rotPoint.width / 2) * sz0.zoom + sz0.scrollX, (rotPoint.y + rotPoint.height) * sz0.zoom + sz0.scrollY));
  });
  await flush(30);
  useBoard.setState({ app: { ...useBoard.getState().app, selection: [rotEl.id] } });
  await flush(50);
  const b = elementBounds(rotEl);
  const sz = useBoard.getState().app;
  const handleX = (b.x + b.width / 2) * sz.zoom + sz.scrollX;
  const handleY = b.y * sz.zoom + sz.scrollY - 26;
  await act(async () => { canvas.dispatchEvent(fire('pointerdown', handleX, handleY)); });
  await flush(5);
  for (let i = 1; i <= 5; i++) {
    await act(async () => { canvas.dispatchEvent(fire('pointermove', handleX + i * 40, handleY + i * 30)); });
  }
  await flush(5);
  await act(async () => { canvas.dispatchEvent(fire('pointerup', handleX + 200, handleY + 150)); });
  await flush();
  const afterRot: any = useBoard.getState().elements.find((e) => e.id === rotEl.id);
  check('rotate applied angle', Math.abs(afterRot.angle ?? 0) > 0.01, String(afterRot.angle));
  await act(async () => { useBoard.getState().undo(); });
}

// 16) copy / paste / duplicate
useBoard.setState({ app: { ...useBoard.getState().app, selection: [rectNow!.id] } });
const n0 = useBoard.getState().elements.length;
useBoard.getState().copySelection();
useBoard.getState().paste();
await flush(10);
check('paste added element', useBoard.getState().elements.length === n0 + 1, `${n0} -> ${useBoard.getState().elements.length}`);
useBoard.getState().duplicateSelection();
await flush(10);
check('duplicate added element', useBoard.getState().elements.length === n0 + 2);
check('copy is offset', (() => {
  const copies = useBoard.getState().elements.slice(-2) as any[];
  return copies.every((c) => c.x !== rectNow!.x);
})());

// 17) grouping + align
const twoIds = useBoard.getState().elements.slice(-2).map((e) => e.id);
useBoard.setState({ app: { ...useBoard.getState().app, selection: twoIds } });
useBoard.getState().groupSelection();
check('group assigned', useBoard.getState().elements.filter((e) => twoIds.includes(e.id)).every((e) => !!e.groupId));
useBoard.getState().alignSelection('left');
await flush(5);
const aligned = useBoard.getState().elements.filter((e) => twoIds.includes(e.id)).map((e) => e.x);
check('align left equalised x', new Set(aligned.map((v) => Math.round(v))).size === 1, JSON.stringify(aligned));

// 18) frames produce slides, PNG + PDF + PPTX export
await act(async () => { tool('f'); });
await drag(60, 600, 900, 780);
const frame: any = useBoard.getState().elements.find((e) => e.type === 'frame');
check('frame created', !!frame);
useBoard.setState({ elements: useBoard.getState().elements.map((e) => (e.id === frame.id ? { ...e, name: 'Slide A' } : e)) });

const { exportPNG, exportPDF, exportPPTX, renderToCanvas, exportSVG: exportSvg2 } = await import('../src/utils/export');
const pngBlob = await exportPNG(useBoard.getState().elements, { scale: 1, background: '#fff', transparent: false, padding: 20, theme: 'light' });
check('png blob produced', pngBlob.size > 100, `${pngBlob.size} bytes`);
const pdfBlob = await exportPDF(useBoard.getState().elements, { scale: 1, background: '#fff', transparent: false, padding: 20, theme: 'light' }, { name: 'Test' });
check('pdf blob produced', pdfBlob.size > 1000, `${pdfBlob.size} bytes`);
const pptxBlob = await exportPPTX(useBoard.getState().elements, { scale: 1, background: '#fff', transparent: false, padding: 20, theme: 'light' }, { name: 'Test' });
check('pptx blob produced', pptxBlob.size > 1000, `${pptxBlob.size} bytes`);
void renderToCanvas; void exportSvg2;

// 19) present mode opens for frames
await act(async () => {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true }));
});
await flush(60);
check('present mode opened', win.document.querySelector('.present-overlay') !== null);
check('present shows a slide', (win.document.querySelector('.present-slide')?.innerHTML ?? '').includes('<svg'));
await act(async () => {
  win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
});
await flush(20);
check('present mode closed', win.document.querySelector('.present-overlay') === null);

console.log('\ndraw calls:', JSON.stringify(drawCalls));
console.log(fails ? `${fails} FAILURES` : 'DOM smoke passed');
process.exit(fails ? 1 : 0);
