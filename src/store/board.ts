import { create } from 'zustand';
import type {
  AppState,
  BoardDocument,
  BoardElement,
  BoardMeta,
  ElementType,
  FreedrawElement,
  LinearElement,
  ShapeElement,
  StickyElement,
  TextElement,
  ToolType,
} from '../types';
import { nanoid, randomSeed } from '../utils/geometry';

export type { BoardMeta } from '../types';

const STORAGE_PREFIX = 'collabboard:v1';
const BOARD_KEY = (id: string) => `${STORAGE_PREFIX}:board:${id}`;
const INDEX_KEY = `${STORAGE_PREFIX}:index`;
const PREFS_KEY = `${STORAGE_PREFIX}:prefs`;

export const DEFAULT_APP_STATE: Pick<
  AppState,
  | 'strokeColor'
  | 'backgroundColor'
  | 'fillStyle'
  | 'strokeWidth'
  | 'strokeStyle'
  | 'roughness'
  | 'opacity'
  | 'fontSize'
  | 'fontFamily'
  | 'theme'
  | 'backgroundPattern'
> = {
  strokeColor: '#1e1e28',
  backgroundColor: 'transparent',
  fillStyle: 'hachure',
  strokeWidth: 2,
  strokeStyle: 'solid',
  roughness: 1,
  opacity: 1,
  fontSize: 24,
  fontFamily: 'hand',
  theme: 'light',
  backgroundPattern: 'dots',
};

const initialApp: AppState = {
  tool: 'select',
  // Tools stay active after a stroke/shape until the user picks another one.
  lockTool: true,
  ...DEFAULT_APP_STATE,
  textAlign: 'left',
  edgeStyle: 'round',
  startArrowhead: 'none',
  endArrowhead: 'arrow',
  gridSize: 20,
  snapToGrid: false,
  zoom: 1,
  scrollX: 0,
  scrollY: 0,
  selection: [],
  editingId: null,
  hoveredId: null,
  laser: null,
  showHelp: false,
  showLibrary: false,
  showExport: false,
  showShare: false,
  showProperties: false,
};

export interface HistoryEntry {
  elements: BoardElement[];
  label: string;
}

interface BoardStore {
  app: AppState;
  elements: BoardElement[];
  boardId: string;
  boardName: string;
  history: HistoryEntry[];
  future: HistoryEntry[];
  dirty: boolean;
  lastSavedAt: number | null;
  setApp: (patch: Partial<AppState>) => void;
  setTool: (tool: ToolType) => void;
  setElements: (els: BoardElement[]) => void;
  addElement: (el: BoardElement, opts?: { select?: boolean; record?: boolean }) => void;
  updateElement: (id: string, patch: Partial<BoardElement>) => void;
  updateElements: (ids: string[], patch: (el: BoardElement) => Partial<BoardElement>) => void;
  replaceElements: (mapper: (els: BoardElement[]) => BoardElement[], record?: boolean) => void;
  deleteSelection: () => void;
  duplicateSelection: () => void;
  select: (ids: string[]) => void;
  pushHistory: (label: string) => void;
  undo: () => void;
  redo: () => void;
  bringToFront: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  alignSelection: (mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
  toggleLock: () => void;
  groupSelection: () => void;
  ungroupSelection: () => void;
  loadBoard: (id: string) => void;
  newBoard: () => void;
  renameBoard: (name: string) => void;
  save: () => void;
  clearBoard: () => void;
  copySelection: () => void;
  paste: () => void;
  clipboard: BoardElement[] | null;
}

/* ------------------------- element factory ------------------------ */
interface CreateOpts {
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  app: AppState;
  text?: string;
}

let autoIndex = 1;

export function createElement({ type, x, y, width, height, app, text }: CreateOpts): BoardElement {
  const base = {
    id: nanoid(),
    x,
    y,
    width,
    height,
    strokeColor: app.strokeColor,
    backgroundColor: 'transparent',
    fillStyle: app.fillStyle,
    strokeWidth: app.strokeWidth,
    strokeStyle: app.strokeStyle,
    roughness: app.roughness,
    opacity: app.opacity,
    angle: 0,
    seed: randomSeed(),
    locked: false,
    groupId: null,
    version: 1,
    index: autoIndex++,
  };

  switch (type) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse':
      return {
        ...base,
        type,
        backgroundColor: app.backgroundColor,
        roundness: app.edgeStyle === 'round' ? 18 : 0,
      } as ShapeElement;
    case 'freedraw':
      return {
        ...base,
        type: 'freedraw',
        points: [],
        pressures: [],
        drawTool: 'pen',
        simulatePressure: true,
        strokeWidth: app.strokeWidth,
      } as FreedrawElement;
    case 'arrow':
    case 'line':
      return {
        ...base,
        type,
        points: [
          [0, 0],
          [width, height],
        ],
        startArrowhead: type === 'arrow' ? app.startArrowhead : 'none',
        endArrowhead: type === 'arrow' ? app.endArrowhead : 'none',
        startBinding: null,
        endBinding: null,
      } as LinearElement;
    case 'text':
      return {
        ...base,
        type: 'text',
        text: text ?? '',
        fontSize: app.fontSize,
        fontFamily: app.fontFamily,
        textAlign: app.textAlign,
        verticalAlign: 'top',
        lineHeight: 1.28,
        containerId: null,
        backgroundColor: 'transparent',
        strokeWidth: 1,
      } as TextElement;
    case 'sticky':
      return {
        ...base,
        type: 'sticky',
        text: text ?? '',
        fontSize: 16,
        fontFamily: 'sans',
        textAlign: app.textAlign,
        backgroundColor: app.backgroundColor === 'transparent' ? '#ffe066' : app.backgroundColor,
        strokeWidth: 1,
        roughness: 0,
      } as StickyElement;
    case 'image':
      return {
        ...base,
        type: 'image',
        src: text ?? '',
        backgroundColor: 'transparent',
      } as BoardElement;
    case 'frame':
      return {
        ...base,
        type: 'frame',
        name: `Frame ${autoIndex}`,
        backgroundColor: 'transparent',
        roughness: 0,
        strokeWidth: 1.5,
      } as BoardElement;
    default:
      return { ...base, type: 'rectangle' } as ShapeElement;
  }
}

/* --------------------------- persistence -------------------------- */
export function loadIndex(): BoardMeta[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as BoardMeta[];
  } catch {
    return [];
  }
}

function saveIndex(index: BoardMeta[]) {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    /* quota */
  }
}

export function readBoard(id: string): BoardDocument | null {
  try {
    const raw = localStorage.getItem(BOARD_KEY(id));
    return raw ? (JSON.parse(raw) as BoardDocument) : null;
  } catch {
    return null;
  }
}

export function writeBoard(doc: BoardDocument) {
  try {
    localStorage.setItem(BOARD_KEY(doc.id), JSON.stringify(doc));
    const index = loadIndex().filter((m) => m.id !== doc.id);
    index.unshift({
      id: doc.id,
      name: doc.name,
      updatedAt: doc.updatedAt,
      createdAt: doc.createdAt ?? doc.updatedAt,
      elementCount: doc.elements.length,
      thumbnail: doc.thumbnail,
    });
    saveIndex(index.slice(0, 40));
    return true;
  } catch {
    return false;
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePrefs(app: AppState) {
  try {
    localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({
        strokeColor: app.strokeColor,
        backgroundColor: app.backgroundColor,
        fillStyle: app.fillStyle,
        strokeWidth: app.strokeWidth,
        strokeStyle: app.strokeStyle,
        roughness: app.roughness,
        opacity: app.opacity,
        fontSize: app.fontSize,
        fontFamily: app.fontFamily,
        theme: app.theme,
        backgroundPattern: app.backgroundPattern,
        endArrowhead: app.endArrowhead,
        startArrowhead: app.startArrowhead,
        edgeStyle: app.edgeStyle,
        lockTool: app.lockTool,
      }),
    );
  } catch {
    /* ignore */
  }
}

const prefs = loadPrefs();

/**
 * Saved prefs from older builds may carry `lockTool: false`, which used to make
 * every tool snap back to Select after one stroke. Tools are sticky now, so the
 * stored value is ignored and the current default wins.
 */
const EDIT_LOCK_OVERRIDE = { lockTool: initialApp.lockTool };

function newBoardId() {
  return nanoid(10);
}

function maxIndex(els: BoardElement[]) {
  return els.reduce((m, e) => Math.max(m, e.index || 0), 0);
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export const useBoard = create<BoardStore>((set, get) => ({
  app: {
    ...initialApp,
    ...(prefs ?? {}),
    ...EDIT_LOCK_OVERRIDE,
  },
  elements: [],
  boardId: newBoardId(),
  boardName: 'Untitled board',
  history: [],
  future: [],
  dirty: false,
  lastSavedAt: null,
  clipboard: null,

  setApp: (patch) => {
    set((s) => ({ app: { ...s.app, ...patch } }));
    if (
      Object.keys(patch).some((k) =>
        [
          'strokeColor',
          'backgroundColor',
          'fillStyle',
          'strokeWidth',
          'strokeStyle',
          'roughness',
          'opacity',
          'fontSize',
          'fontFamily',
          'theme',
          'backgroundPattern',
          'endArrowhead',
          'startArrowhead',
          'edgeStyle',
          'lockTool',
        ].includes(k),
      )
    ) {
      savePrefs(get().app);
    }
  },

  setTool: (tool) => {
    const patch: Partial<AppState> = { tool };
    if (tool !== 'select' && tool !== 'hand' && tool !== 'eraser' && tool !== 'laser') {
      patch.selection = [];
      patch.editingId = null;
    }
    if (tool === 'eraser') {
      patch.selection = [];
      patch.editingId = null;
    }
    set((s) => ({ app: { ...s.app, ...patch } }));
  },

  setElements: (els) => set({ elements: els }),

  addElement: (el, opts) => {
    get().pushHistory(`add ${el.type}`);
    set((s) => ({
      elements: [...s.elements, el],
      app: opts?.select
        ? { ...s.app, selection: [el.id], tool: s.app.lockTool ? s.app.tool : 'select' }
        : s.app,
      dirty: true,
    }));
  },

  updateElement: (id, patch) => {
    set((s) => ({
      elements: s.elements.map((el) =>
        el.id === id ? ({ ...el, ...patch, version: el.version + 1 } as BoardElement) : el,
      ),
      dirty: true,
    }));
  },

  updateElements: (ids, patch) => {
    const idSet = new Set(ids);
    set((s) => ({
      elements: s.elements.map((el) =>
        idSet.has(el.id) ? ({ ...el, ...patch(el), version: el.version + 1 } as BoardElement) : el,
      ),
      dirty: true,
    }));
  },

  replaceElements: (mapper, record = true) => {
    if (record) get().pushHistory('edit');
    set((s) => ({ elements: mapper(s.elements), dirty: true }));
  },

  deleteSelection: () => {
    const { app } = get();
    if (!app.selection.length) return;
    get().pushHistory('delete');
    const sel = new Set(app.selection);
    set((s) => ({
      elements: s.elements
        .filter((el) => !sel.has(el.id))
        .map((el) => {
          if (el.type === 'arrow' || el.type === 'line') {
            const lin = el as LinearElement;
            if (
              (lin.startBinding && sel.has(lin.startBinding)) ||
              (lin.endBinding && sel.has(lin.endBinding))
            ) {
              return el;
            }
          }
          return el;
        }),
      app: { ...s.app, selection: [], editingId: null },
      dirty: true,
    }));
  },

  duplicateSelection: () => {
    const { app, elements } = get();
    if (!app.selection.length) return;
    get().pushHistory('duplicate');
    const sel = new Set(app.selection);
    const copies = elements
      .filter((el) => sel.has(el.id))
      .map((el) => ({
        ...clone(el),
        id: nanoid(),
        x: el.x + 20,
        y: el.y + 20,
        index: autoIndex++,
        seed: randomSeed(),
        version: 1,
      }));
    set((s) => ({
      elements: [...s.elements, ...copies],
      app: { ...s.app, selection: copies.map((c) => c.id) },
      dirty: true,
    }));
  },

  select: (ids) => set((s) => ({ app: { ...s.app, selection: ids } })),

  pushHistory: (label) => {
    const { elements, history } = get();
    set({
      history: [...history.slice(-60), { elements: clone(elements), label }],
      future: [],
    });
  },

  undo: () => {
    const { history, future, elements } = get();
    if (!history.length) return;
    const last = history[history.length - 1];
    set({
      elements: last.elements,
      history: history.slice(0, -1),
      future: [...future, { elements: clone(elements), label: last.label }],
      app: { ...get().app, selection: [], editingId: null },
      dirty: true,
    });
  },

  redo: () => {
    const { history, future, elements } = get();
    if (!future.length) return;
    const next = future[future.length - 1];
    set({
      elements: next.elements,
      future: future.slice(0, -1),
      history: [...history, { elements: clone(elements), label: next.label }],
      app: { ...get().app, selection: [], editingId: null },
      dirty: true,
    });
  },

  bringToFront: (ids) => {
    const sel = new Set(ids);
    get().pushHistory('bring to front');
    set((s) => {
      const picked = s.elements.filter((e) => sel.has(e.id));
      const rest = s.elements.filter((e) => !sel.has(e.id));
      const maxIdx = maxIndex(rest);
      return {
        elements: [...rest, ...picked.map((e, i) => ({ ...e, index: maxIdx + i + 1 }))],
        dirty: true,
      };
    });
  },

  sendToBack: (ids) => {
    const sel = new Set(ids);
    get().pushHistory('send to back');
    set((s) => {
      const picked = s.elements.filter((e) => sel.has(e.id));
      const rest = s.elements.filter((e) => !sel.has(e.id));
      const minIdx = rest.reduce((m, e) => Math.min(m, e.index || 0), Infinity);
      const base = Number.isFinite(minIdx) ? minIdx : 0;
      return {
        elements: [...picked.map((e, i) => ({ ...e, index: base - picked.length + i })), ...rest],
        dirty: true,
      };
    });
  },

  alignSelection: (mode) => {
    const { app, elements } = get();
    const sel = elements.filter((e) => app.selection.includes(e.id));
    if (sel.length < 2) return;
    get().pushHistory('align');
    const minX = Math.min(...sel.map((e) => Math.min(e.x, e.x + e.width)));
    const maxX = Math.max(...sel.map((e) => Math.max(e.x, e.x + e.width)));
    const minY = Math.min(...sel.map((e) => Math.min(e.y, e.y + e.height)));
    const maxY = Math.max(...sel.map((e) => Math.max(e.y, e.y + e.height)));
    const idSet = new Set(sel.map((e) => e.id));
    set((s) => ({
      elements: s.elements.map((e) => {
        if (!idSet.has(e.id)) return e;
        const w = Math.abs(e.width);
        const h = Math.abs(e.height);
        switch (mode) {
          case 'left':
            return { ...e, x: minX };
          case 'right':
            return { ...e, x: maxX - w };
          case 'center':
            return { ...e, x: (minX + maxX) / 2 - w / 2 };
          case 'top':
            return { ...e, y: minY };
          case 'bottom':
            return { ...e, y: maxY - h };
          case 'middle':
            return { ...e, y: (minY + maxY) / 2 - h / 2 };
          default:
            return e;
        }
      }),
      dirty: true,
    }));
  },

  toggleLock: () => {
    const { app, elements } = get();
    const sel = new Set(app.selection);
    if (!sel.size) return;
    const anyUnlocked = elements.some((e) => sel.has(e.id) && !e.locked);
    get().pushHistory('lock');
    set((s) => ({
      elements: s.elements.map((e) => (sel.has(e.id) ? { ...e, locked: anyUnlocked } : e)),
      dirty: true,
    }));
  },

  groupSelection: () => {
    const { app } = get();
    if (app.selection.length < 2) return;
    const gid = nanoid(8);
    get().pushHistory('group');
    const sel = new Set(app.selection);
    set((s) => ({
      elements: s.elements.map((e) => (sel.has(e.id) ? { ...e, groupId: gid } : e)),
      dirty: true,
    }));
  },

  ungroupSelection: () => {
    const { app, elements } = get();
    const sel = new Set(app.selection);
    const groups = new Set(
      elements.filter((e) => sel.has(e.id) && e.groupId).map((e) => e.groupId as string),
    );
    if (!groups.size) return;
    get().pushHistory('ungroup');
    set((s) => ({
      elements: s.elements.map((e) =>
        e.groupId && groups.has(e.groupId) ? { ...e, groupId: null } : e,
      ),
      dirty: true,
    }));
  },

  loadBoard: (id) => {
    const doc = readBoard(id);
    if (!doc) return;
    set({
      elements: doc.elements,
      boardId: doc.id,
      boardName: doc.name,
      history: [],
      future: [],
      dirty: false,
      lastSavedAt: doc.updatedAt,
      app: {
        ...get().app,
        ...(doc.appState ?? {}),
        selection: [],
        editingId: null,
        zoom: 1,
        scrollX: 0,
        scrollY: 0,
      },
    });
    autoIndex = maxIndex(doc.elements) + 1;
  },

  newBoard: () => {
    const id = newBoardId();
    set({
      elements: [],
      boardId: id,
      boardName: 'Untitled board',
      history: [],
      future: [],
      dirty: false,
      lastSavedAt: null,
      app: { ...get().app, selection: [], editingId: null, zoom: 1, scrollX: 0, scrollY: 0 },
    });
    autoIndex = 1;
  },

  renameBoard: (name) => set({ boardName: name, dirty: true }),

  save: () => {
    const { elements, boardId, boardName, app } = get();
    const existing = readBoard(boardId);
    const doc: BoardDocument = {
      id: boardId,
      name: boardName,
      elements: elements.map((e, i) => ({ ...e, index: e.index ?? i })),
      appState: {
        strokeColor: app.strokeColor,
        backgroundColor: app.backgroundColor,
        fillStyle: app.fillStyle,
        strokeWidth: app.strokeWidth,
        strokeStyle: app.strokeStyle,
        theme: app.theme,
        backgroundPattern: app.backgroundPattern,
        fontSize: app.fontSize,
        fontFamily: app.fontFamily,
        roughness: app.roughness,
        opacity: app.opacity,
      },
      version: 1,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const ok = writeBoard(doc);
    set({ dirty: !ok, lastSavedAt: Date.now() });
    return ok;
  },

  clearBoard: () => {
    get().pushHistory('clear');
    set({ elements: [], app: { ...get().app, selection: [] }, dirty: true });
  },

  copySelection: () => {
    const { app, elements } = get();
    const sel = new Set(app.selection);
    const picked = elements.filter((e) => sel.has(e.id));
    if (!picked.length) return;
    set({ clipboard: clone(picked) });
    try {
      localStorage.setItem(`${STORAGE_PREFIX}:clipboard`, JSON.stringify(clone(picked)));
    } catch {
      /* ignore */
    }
  },

  paste: () => {
    let items = get().clipboard;
    if (!items) {
      try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}:clipboard`);
        if (raw) items = JSON.parse(raw);
      } catch {
        items = null;
      }
    }
    if (!items?.length) return;
    get().pushHistory('paste');
    const copies = items.map((el) => ({
      ...clone(el),
      id: nanoid(),
      x: el.x + 24,
      y: el.y + 24,
      index: autoIndex++,
      version: 1,
    }));
    set((s) => ({
      elements: [...s.elements, ...copies],
      app: { ...s.app, selection: copies.map((c) => c.id) },
      dirty: true,
    }));
  },
}));
