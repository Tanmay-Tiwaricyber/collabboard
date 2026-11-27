/* Headless smoke test: builds every element type, renders it, and round-trips
   the share/compress + persistence code paths without a DOM. */
import { createElement } from '../src/store/board';
import type { AppState, BoardElement } from '../src/types';
import { elementBounds, unionBounds, hitTest, elementsInRadius, wrapText } from '../src/utils/geometry';
import { sceneToSvg, elementToSvg } from '../src/scene/renderer';
import LZString from 'lz-string';

const app = {
  strokeColor: '#1e1e28', backgroundColor: '#ffe066', fillStyle: 'hachure',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 1,
  fontSize: 24, fontFamily: 'hand', textAlign: 'left', edgeStyle: 'round',
  startArrowhead: 'none', endArrowhead: 'arrow', theme: 'light',
} as unknown as AppState;

const els: BoardElement[] = [];
const types = ['rectangle','diamond','ellipse','arrow','line','text','sticky','frame','image','freedraw'] as const;
for (const t of types) {
  const el = createElement({ type: t, x: 10, y: 10, width: 120, height: 80, app, text: t === 'text' ? 'hello\nworld' : 'data:image/png;base64,iVBORw0KGgo=' });
  if (el.type === 'freedraw') {
    (el as any).points = [[0,0],[10,12],[24,20],[40,26]];
    (el as any).pressures = [.3,.5,.7,.4];
    (el as any).simulatePressure = true;
  }
  if (el.type === 'arrow' || el.type === 'line') (el as any).points = [[0,0],[100,60]];
  if (el.type === 'sticky') (el as any).text = 'note text here';
  els.push(el);
}
els.forEach((e, i) => { e.index = i; });

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.error('FAIL', name, extra); } else console.log('ok  ', name);
};

// 1. bounds
for (const e of els) {
  const b = elementBounds(e);
  check(`bounds finite ${e.type}`, Number.isFinite(b.x) && Number.isFinite(b.width), JSON.stringify(b));
}
const ub = unionBounds(els.map(elementBounds));
check('union bounds', ub.width > 0 && ub.height > 0);

// 2. svg export for every element
for (const e of els) {
  const svg = elementToSvg(e);
  check(`svg export ${e.type}`, typeof svg === 'string', svg.slice(0, 80));
}
const scene = sceneToSvg(els, ub, '#ffffff');
check('scene svg has paths', scene.includes('<path') || scene.includes('<image'));
check('scene svg well-formed-ish', scene.startsWith('<svg') && scene.endsWith('</svg>'));

// 3. hit testing
const rect = els[0];
check('hit rect center', !!hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2, [rect], 1));
check('miss far away', hitTest(rect.x + 5000, rect.y + 5000, [rect], 1) === null);
const stroke = els.find((e) => e.type === 'freedraw')!;
const pt = (stroke as any).points[2];
check('hit freedraw vertex', !!hitTest(stroke.x + pt[0], stroke.y + pt[1], [stroke], 1));
check('eraser radius catches', elementsInRadius(rect.x + 2, rect.y + 2, 12, [rect]).length === 1);

// 4. text wrapping
const lines = wrapText(null, 'a\nb\nc', 100, '16px sans-serif');
check('wrap keeps newlines', lines.length === 3, JSON.stringify(lines));

// 5. share compression round trip
const slim = els.map((e) => ({ ...e, x: Math.round(e.x), points: (e as any).points?.map((p: number[]) => p.map((n) => Math.round(n))) }));
const compressed = LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, n: 'test', e: slim, t: 'light' }));
const back = JSON.parse(LZString.decompressFromEncodedURIComponent(compressed)!);
check('share roundtrip count', back.e.length === els.length);
check('share url-safe', /^[A-Za-z0-9+\-$]*$/.test(compressed));
console.log(`\nshare payload: ${compressed.length} chars for ${els.length} elements`);

console.log(fails ? `\n${fails} FAILURES` : '\nall smoke checks passed');
process.exit(fails ? 1 : 0);
