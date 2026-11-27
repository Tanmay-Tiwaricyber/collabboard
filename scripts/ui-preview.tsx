/* Render the real app shell to static HTML + inline CSS, so the UI can be
   visually reviewed without a browser. */
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync } from 'fs';
import { renderToString } from 'react-dom/server';
import { createElement as h } from 'react';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).localStorage = dom.window.localStorage;
// node provides navigator

const { useBoard, createElement } = (await import('../src/store/board')) as any;
const app = useBoard.getState().app;
const mk = (type: string, x: number, y: number, w: number, h: number, over: any = {}, text?: string) => {
  const el = createElement({ type, x, y, width: w, height: h, app: { ...app, ...over }, text });
  return el;
};
const els: any[] = [];
els.push(mk('text', 120, 60, 420, 44, { fontSize: 34, textAlign: 'left', strokeColor: '#1e1e28' }, 'Product brainstorm'));
els.push(mk('rectangle', 120, 130, 200, 110, { backgroundColor: '#a5d8ff', fillStyle: 'solid' }));
els.push(mk('diamond', 380, 120, 220, 130, { backgroundColor: '#ffe066', strokeColor: '#e03131' }));
els.push(mk('ellipse', 670, 130, 200, 110, { backgroundColor: '#d0bfff', fillStyle: 'cross-hatch', strokeColor: '#6d5efc' }));
els.push(mk('arrow', 322, 185, 56, 0, {}));
els.push(mk('arrow', 602, 185, 66, 0, {}));
els.push(mk('sticky', 130, 300, 190, 150, {}, 'Ship weekly\n+ templates\n+ PDF export'));
els.push(mk('sticky', 360, 315, 190, 140, { backgroundColor: '#b2f2bb' }, 'Handwriting\nPen & pencil'));
els.push(mk('sticky', 600, 305, 190, 150, { backgroundColor: '#ffc9c9' }, 'Share via link'));
const f = mk('freedraw', 130, 490, 300, 60, { strokeColor: '#1e1e28' });
f.points = Array.from({ length: 60 }, (_, i) => [i * 4.6, Math.sin(i / 5) * 22 + Math.sin(i / 2) * 5]);
f.pressures = Array(60).fill(0.5);
els.push(f);
els.forEach((e: any, i: number) => (e.index = i));
els[1].backgroundColor = '#a5d8ff';
useBoard.setState({
  elements: els,
  boardName: 'Product brainstorm',
  app: { ...app, selection: [els[2].id], showProperties: true, tool: 'pen', lastSavedAt: Date.now(), dirty: false },
});

const TopBar = (await import('../src/components/TopBar')).default;
const Toolbar = (await import('../src/components/Toolbar')).default;
const Props = (await import('../src/components/PropertiesPanel')).default;
const Quick = (await import('../src/components/QuickStyleBar')).default;
const CMenu = (await import('../src/components/CanvasMenu')).default;
const noop = () => {};
const { sceneToSvg } = await import('../src/scene/renderer');
const svg = sceneToSvg(els, { x: 100, y: 30, width: 800, height: 540 }, 'transparent', 0);

const body = `
<div class="topbar">${renderToString(h(TopBar, { onShare: noop, onExport: noop, onLibrary: noop, onHelp: noop, onNew: noop }))}</div>
<main class="board-area">
  <div class="canvas-wrap" style="background:#fbfbfd">
    <div style="position:absolute;inset:0;display:grid;place-items:center;opacity:1">
      <div style="width:100%;height:100%;background-image:radial-gradient(rgba(15,20,40,.12) 1px, transparent 1px);background-size:24px 24px">
        <div style="position:absolute;left:60px;top:20px;width:860px">${svg}</div>
      </div>
    </div>
  </div>
  <div class="toolbar">${renderToString(h(Toolbar, {}))}</div>
  <div class="properties-panel">${renderToString(h(Props, {}))}</div>
  <div class="quick-style">${renderToString(h(Quick, {}))}</div>
  <div class="zoom-hud"><button>−</button><button class="zoom-value">100%</button><button>+</button><span class="divider"></span><button>Fit</button></div>
  <div class="canvas-menu-wrap"><button class="canvas-menu-btn">◫</button></div>
</main>`;

const css = readFileSync('src/styles.css', 'utf8');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8">
<style>${css}
body{margin:0;font-family:Inter,system-ui,sans-serif}
.properties-panel{position:absolute!important}
.toolbar{position:absolute!important}
.quick-style{position:absolute!important}
</style></head><body><div class="app">${body}</div></body></html>`;
writeFileSync('/tmp/ui.html', html);
console.log('wrote /tmp/ui.html', html.length);
