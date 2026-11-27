/* Exercise the real canvas renderer with a recording 2D context stub. */
import { createElement } from '../src/store/board';
import type { AppState, BoardElement } from '../src/types';
import { drawElement, renderScene, drawBackground } from '../src/scene/renderer';

class Path2DStub {
  ops: string[] = [];
  constructor(d?: string) { if (d) this.ops.push('d:' + d.length); }
  moveTo() { this.ops.push('m'); }
  lineTo() { this.ops.push('l'); }
  bezierCurveTo() { this.ops.push('c'); }
  quadraticCurveTo() { this.ops.push('q'); }
  arc() { this.ops.push('a'); }
  closePath() { this.ops.push('z'); }
  rect() { this.ops.push('r'); }
}
(globalThis as any).Path2D = Path2DStub;
(globalThis as any).Image = class { constructor() { setTimeout(() => (this as any).onerror?.()); } set src(_v: string) {} };

const calls: Record<string, number> = {};
const ctx = new Proxy({} as any, {
  get(_t, prop: string) {
    if (prop === 'canvas') return { width: 800, height: 600 };
    if (prop === 'measureText') return () => ({ width: 42 });
    return (...args: any[]) => {
      calls[prop] = (calls[prop] ?? 0) + 1;
      void args;
    };
  },
  set() { return true; },
});

const app = { strokeColor: '#1e1e28', backgroundColor: '#ffe066', fillStyle: 'solid', strokeWidth: 2, strokeStyle: 'dashed', roughness: 1.5, opacity: 0.9, fontSize: 22, fontFamily: 'casual', textAlign: 'center', edgeStyle: 'round', startArrowhead: 'arrow', endArrowhead: 'triangle', theme: 'dark', backgroundPattern: 'grid' } as unknown as AppState;

const els: BoardElement[] = [];
const add = (type: any, extra?: string) => {
  const el = createElement({ type, x: 20 + els.length * 30, y: 30, width: 140, height: 90, app, text: extra });
  els.push(el);
  return el;
};
add('rectangle'); add('diamond'); add('ellipse');
const a = add('arrow'); (a as any).points = [[0, 0], [60, 20], [120, 70]];
add('line', '');
const t = add('text', 'multi\nline text that wraps around') as any;
add('sticky', 'sticky body');
add('image', 'data:image/png;base64,AAA');
add('frame');
const f = add('freedraw') as any;
f.points = [[0, 0], [10, 20], [30, 40]]; f.pressures = [0.2, 0.6, 0.9]; f.drawType = 'pen';
els.forEach((e, i) => (e.index = i));

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.error('FAIL', name, extra); } else console.log('ok  ', name);
};
try {
  drawBackground(ctx, 800, 600, 1.5, 20, 30, 'grid', 'dark');
  drawBackground(ctx, 800, 600, 0.01, 0, 0, 'dots', 'light');
  for (const el of els) {
    for (const opacity of [1, 0.4]) {
      drawElement(ctx, { ...el, opacity }, { theme: 'dark', selectionColor: '#6d5efc' });
    }
  }
  renderScene(ctx, els, { zoom: 1.7, scrollX: -40, scrollY: 12, width: 800, height: 600 }, { theme: 'light', selectionColor: '#6d5efc', pattern: 'lines' });
  // zero-size / degenerate elements must not throw
  drawElement(ctx, { ...els[0], width: 0, height: 0 }, { theme: 'light', selectionColor: '#000' });
  drawElement(ctx, { ...f, points: [], pressures: [] }, { theme: 'light', selectionColor: '#000' });
  const line = els.find((e) => e.type === 'line')! as any;
  drawElement(ctx, { ...line, points: [[0, 0]] }, { theme: 'light', selectionColor: '#000' });
} catch (err) {
  fails++;
  console.error('RENDER THREW:', err);
}
/* DPR regression: with a 2x backing store the scene transform must include the
   ratio, otherwise the board would render into a quarter of the canvas. */
const transforms: number[][] = [];
const tctx = new Proxy({} as any, {
  get(_t, prop: string) {
    if (prop === 'canvas') return { width: 1600, height: 1200 };
    if (prop === 'measureText') return () => ({ width: 20 });
    if (prop === 'setTransform') return (...a: number[]) => transforms.push(a);
    return () => {};
  },
  set() { return true; },
});
drawBackground(tctx, 1600, 1200, 1, 0, 0, 'dots', 'light');
transforms.length = 0;
renderScene(tctx, els.slice(0, 3), { zoom: 1.5, scrollX: 30, scrollY: 20, width: 800, height: 600, pixelRatio: 2 }, { theme: 'light', selectionColor: '#000' });
// transforms: [background @dpr, scene @dpr*zoom, restore @dpr]
const sceneT = transforms[1];
check('dpr included in scene transform', !!sceneT && sceneT[0] === 3 && sceneT[3] === 3, JSON.stringify(transforms));
check('scene translate scaled by dpr', !!sceneT && sceneT[4] === 60 && sceneT[5] === 40, JSON.stringify(sceneT));
check('restore keeps dpr', transforms[2]?.[0] === 2, JSON.stringify(transforms[2]));

console.log('canvas ops:', Object.entries(calls).sort().map(([k, v]) => `${k}=${v}`).join(' '));
const painted = (calls.stroke ?? 0) + (calls.fill ?? 0);
if (painted < 20) { fails++; console.error('FAIL: too little painting', painted); }
console.log(fails ? 'FAILED' : 'canvas smoke passed');
process.exit(fails ? 1 : 0);
