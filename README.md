# CollabBoard

An infinite whiteboard for **handwritten notes, sketches and diagrams** — the drawing feel of Excalidraw with the export/sharing chops of Canva.

Draw with a pressure-sensitive pen, pencil or highlighter, drop in shapes, arrows, sticky notes and text, then export as PNG / SVG / PDF / PowerPoint or share the whole board with a link.

---

## Features

### Drawing & handwriting
- **Pen** — pressure-sensitive ink (real `pointer.pressure` on tablets/styluses, simulated from velocity otherwise), smoothed with `perfect-freehand`.
- **Pencil** — thinner, grainier, more textured line.
- **Highlighter** — wide, multiply-blended, semi-transparent.
- **Eraser** — stroke-level and element-level erasing with a live cursor ring.
- **Laser pointer** — presentation sparkle trail that fades away.
- **Six stroke widths**, solid / dashed / dotted strokes, opacity control.

### Canvas
- **Unlimited canvas** with pan (space-drag, middle-drag, hand tool, two-finger drag) and zoom from 5 % to 2400 % (`Ctrl`+scroll, pinch on touch, `Ctrl` +/−, `Fit`).
- Paper styles — dots, grid, lined, blank — and light / dark themes.
- Alignment guides with snapping, optional grid snapping, marquee and shift multi-select.
- Frames that act as slide boundaries.

### Shapes & diagrams
- Rectangles (sharp or rounded), diamonds, ellipses with rough, hand-drawn rendering via `rough.js`.
- Fill styles: hachure, cross-hatch, solid, dots, zigzag.
- Lines and **smart arrows** — 5 arrowheads per end, arrows snap and stay bound to the shapes they connect.
- Double-click a shape to type a label inside it.

### Text & notes
- Multi-line text with auto-wrap and click-to-edit on the canvas.
- Five fonts (two handwriting, a marker, sans, monospace) including Virgil and Caveat.
- Sticky notes in eight colors with inline editing.

### Arrange & edit
- Select, move, resize (8 handles, `Shift` to keep ratio), rotate (`Shift` to snap 15°).
- Group / ungroup, lock, align, distribute, bring-to-front / send-to-back.
- Copy / paste (also pastes images and text from anywhere), duplicate, full undo/redo history, keyboard nudge.

### Export
| Format | What you get |
| --- | --- |
| **PNG** | 1×–4× resolution, transparent or paper background |
| **SVG** | true vector, infinitely zoomable |
| **PDF** | A4 print-ready, high-DPI |
| **PPTX** | one frame per slide (auto-pages without frames) |
| **Copy to clipboard** | paste the board straight into chat/docs |
| **Board file (JSON)** | re-importable backup via *Boards → Import* |

### Sharing
- **Share link** — the entire board is LZ-compressed into the URL hash. No server, no account, works forever, stays private.
- **QR code**, X / WhatsApp / email intents and a copyable edit link.
- **Embed SVG** and a self-contained **image data-URL** for Notion / READMEs.
- **Present mode** — frames become a fullscreen slide deck (`Ctrl/⌘ P`).

### Persistence
- Boards autosave to the browser every few seconds with thumbnails in a board library (searchable, duplicate, delete, import).
- Everything is local-first: `localStorage` never sends your board anywhere.

---

## Tech stack

| Layer | Choice | Why |
| --- | --- | --- |
| UI | **React 18 + TypeScript (strict)** | component model, type safety |
| Build | **Vite 5** | instant HMR, tiny config |
| State | **Zustand** | fine-grained subscriptions, no provider boilerplate |
| Canvas | **HTML5 Canvas 2D** | only way to hit 60 fps with thousands of strokes |
| Rough shapes | **rough.js** | hand-drawn Excalidraw look |
| Ink | **perfect-freehand** | smoothed pressure outlines |
| Share links | **lz-string** | URL-safe compressed board payloads |
| PDF | **jsPDF** (lazy) | high-DPI raster pages |
| Slides | **PptxGenJS** (lazy) | real `.pptx` with one slide per frame |
| QR | **qrcode** (lazy) | scannable share links |
| Icons | **lucide-react** | crisp, consistent iconography |

The renderer is fully deterministic and shared: the same code path draws to the live canvas and to the SVG/PNG/PDF/PPTX exporters, so what you see is what you export.

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production bundle in dist/
npm run preview  # serve the production build
npm run check    # typecheck + headless render smoke tests
```

## Keyboard shortcuts

| Key | Action | Key | Action |
| --- | --- | --- | --- |
| `V` | Select | `P` | Pen |
| `B` | Pencil | `M` | Highlighter |
| `E` | Eraser | `R` | Rectangle |
| `D` | Diamond | `O` | Ellipse |
| `A` | Arrow | `L` | Line |
| `T` | Text | `N` | Sticky note |
| `F` | Frame | `I` | Insert image |
| `K` | Laser pointer | `H` | Pan |
| `1`–`4` | Stroke width | `Ctrl/⌘ Z` | Undo |
| `Ctrl/⌘ ⇧ Z` | Redo | `Ctrl/⌘ D` | Duplicate |
| `Ctrl/⌘ A` | Select all | `Ctrl/⌘ C/V` | Copy / paste |
| `Ctrl/⌘ S` | Save | `Ctrl/⌘ P` | Present |
| `Ctrl/⌘ ⇧ E` | Export | `Ctrl/⌘ ⇧ S` | Share |
| `Ctrl/⌘ 0` | Reset zoom | `Shift + drag` | Constrain |
| `Alt + drag` | Disable snapping | `Double-click` | Edit text |

## Project layout

```
src/
  types.ts               domain model for every element type
  scene/rough.ts         rough.js drawable generation + drawable cache
  scene/renderer.ts      canvas rendering, SVG serialisation, image cache
  store/board.ts         zustand store: elements, history, persistence
  utils/geometry.ts      bounds, hit testing, text wrapping
  utils/bind.ts          arrow ↔ shape binding geometry
  utils/export.ts        PNG / SVG / PDF / PPTX / JSON / clipboard
  utils/share.ts         link compression, routing, clipboard helpers
  components/            Canvas, Toolbar, TopBar, panels, dialogs
scripts/                 headless render smoke tests
```

## Licence

MIT
