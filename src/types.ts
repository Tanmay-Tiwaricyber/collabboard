export type Point = [number, number];

export type FillStyle = 'hachure' | 'cross-hatch' | 'solid' | 'dots' | 'zigzag';
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';
export type DrawTool = 'pen' | 'pencil' | 'highlighter';
export type ArrowHead = 'none' | 'arrow' | 'triangle' | 'circle' | 'bar';
export type TextAlign = 'left' | 'center' | 'right';
export type VerticalAlign = 'top' | 'middle' | 'bottom';
export type Theme = 'dark' | 'light';
export type BackgroundPattern = 'dots' | 'grid' | 'lines' | 'none';

export type ElementType =
  | 'freedraw'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'sticky'
  | 'image'
  | 'frame';

export type ToolType =
  | 'select'
  | 'hand'
  | 'pen'
  | 'pencil'
  | 'highlighter'
  | 'eraser'
  | 'rectangle'
  | 'diamond'
  | 'ellipse'
  | 'arrow'
  | 'line'
  | 'text'
  | 'sticky'
  | 'frame'
  | 'image'
  | 'laser';

export interface ElementBase {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  angle: number;
  seed: number;
  locked: boolean;
  groupId?: string | null;
  version: number;
  /** creation order, used for stacking */
  index: number;
}

export interface FreedrawElement extends ElementBase {
  type: 'freedraw';
  points: Point[];
  pressures: number[];
  drawTool: DrawTool;
  simulatePressure: boolean;
}

export interface ShapeElement extends ElementBase {
  type: 'rectangle' | 'diamond' | 'ellipse';
  roundness: number;
}

export interface LinearElement extends ElementBase {
  type: 'arrow' | 'line';
  points: Point[];
  startArrowhead: ArrowHead;
  endArrowhead: ArrowHead;
  startBinding: string | null;
  endBinding: string | null;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  verticalAlign: VerticalAlign;
  lineHeight: number;
  containerId?: string | null;
}

export interface StickyElement extends ElementBase {
  type: 'sticky';
  text: string;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  src: string;
}

export interface FrameElement extends ElementBase {
  type: 'frame';
  name: string;
}

export type BoardElement =
  | FreedrawElement
  | ShapeElement
  | LinearElement
  | TextElement
  | StickyElement
  | ImageElement
  | FrameElement;

export interface Binding {
  elementId: string;
}

export interface AppState {
  tool: ToolType;
  lockTool: boolean;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  opacity: number;
  fontSize: number;
  fontFamily: string;
  textAlign: TextAlign;
  edgeStyle: 'sharp' | 'round';
  startArrowhead: ArrowHead;
  endArrowhead: ArrowHead;
  theme: Theme;
  backgroundPattern: BackgroundPattern;
  gridSize: number;
  snapToGrid: boolean;
  zoom: number;
  scrollX: number;
  scrollY: number;
  selection: string[];
  editingId: string | null;
  hoveredId: string | null;
  laser: { points: Point[]; t: number } | null;
  showHelp: boolean;
  showLibrary: boolean;
  showExport: boolean;
  showShare: boolean;
  showProperties: boolean;
}

export interface BoardMeta {
  id: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  thumbnail?: string;
  elementCount: number;
}

export interface BoardDocument {
  id: string;
  name: string;
  elements: BoardElement[];
  appState: Pick<
    AppState,
    'strokeColor' | 'backgroundColor' | 'fillStyle' | 'strokeWidth' | 'strokeStyle' | 'theme' | 'backgroundPattern' | 'fontSize' | 'fontFamily' | 'roughness' | 'opacity'
  >;
  version: number;
  updatedAt: number;
  createdAt?: number;
  thumbnail?: string;
}
