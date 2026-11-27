import { createElement } from '../src/store/board';
import type { AppState, BoardElement } from '../src/types';
import { sceneToSvg } from '../src/scene/renderer';
import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'fs';

const base = { strokeColor: '#1e1e28', backgroundColor: 'transparent', fillStyle: 'hachure', strokeWidth: 2, strokeStyle: 'solid', roughness: 1.2, opacity: 1, fontSize: 24, fontFamily: 'hand', textAlign: 'center', edgeStyle: 'round', startArrowhead: 'none', endArrowhead: 'arrow', theme: 'light' } as unknown as AppState;
const el = (type: any, x: number, y: number, w: number, h: number, over: Partial<AppState> = {}, text?: string) =>
  createElement({ type, x, y, width: w, height: h, app: { ...base, ...over } as AppState, text });
const els: BoardElement[] = [];
const push = (e: BoardElement) => { els.push(e); return e; };

push(el('text', 60, 20, 420, 44, { fontSize: 34, textAlign: 'left' }, 'Product brainstorm'));

const a = push(el('rectangle', 60, 90, 200, 110, { backgroundColor: '#a5d8ff', fillStyle: 'solid' })) as any;
const b = push(el('diamond', 320, 80, 220, 130, { backgroundColor: '#ffe066', fillStyle: 'hachure', strokeColor: '#e03131' })) as any;
const c = push(el('ellipse', 610, 90, 200, 110, { backgroundColor: '#d0bfff', fillStyle: 'cross-hatch', strokeColor: '#6d5efc' })) as any;
push(el('text', 72, 130, 176, 30, { fontSize: 20, textAlign: 'center', strokeColor: '#1971c2' }, 'Sketch ideas'));

const arrow = (x: number, y: number, w: number, h: number, over: Partial<AppState> = {}) => push(el('arrow', x, y, w, h, over)) as any;
arrow(262, 140, 56, 0);
arrow(542, 142, 66, 0);

const note = push(el('sticky', 70, 260, 190, 150, {}, 'Ship weekly\n+ templates\n+ PDF export')) as any;
const note2 = push(el('sticky', 300, 275, 190, 140, { backgroundColor: '#b2f2bb' }, 'Handwriting\nFeel: pencil\n& pen')) as any;
const note3 = push(el('sticky', 540, 265, 190, 150, { backgroundColor: '#ffc9c9' }, 'Share via link\n(no server)')) as any;
note.fontFamily = 'marker'; note2.fontFamily = 'casual'; note3.fontFamily = 'marker';

// handwriting squiggle signature
const f = push(el('freedraw', 70, 450, 300, 60)) as any;
f.drawTool = 'pen'; f.strokeWidth = 2.5;
f.points = Array.from({ length: 80 }, (_, i) => [i * 3.6, Math.sin(i / 5) * 22 + Math.sin(i / 2) * 5]);
f.pressures = f.points.map((_: number, i: number) => 0.35 + 0.3 * Math.abs(Math.sin(i / 7)));

const d = push(el('line', 430, 430, 240, 90, { strokeColor: '#0ca678', strokeStyle: 'dashed', strokeWidth: 3 })) as any;
d.points = [[0, 0], [240, 90]];
const line2 = push(el('rectangle', 430, 545, 240, 60, { backgroundColor: '#e6fcf5', strokeStyle: 'dotted', strokeColor: '#0ca678', fillStyle: 'dots' })) as any;

els.forEach((e, i) => (e.index = i));
const svg = sceneToSvg(els, { x: 40, y: 0, width: 800, height: 630 }, '#fbfbfd');
writeFileSync('/tmp/sample.svg', svg);
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1100 }, background: '#fbfbfd' }).render().asPng();
writeFileSync('/tmp/sample.png', png);
console.log('svg', svg.length, 'png', png.length);
