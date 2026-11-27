import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Layers,
  PaintBucket,
  Palette,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import { useBoard } from '../store/board';
import type { ArrowHead, FillStyle, StrokeStyle, TextAlign } from '../types';

export const PALETTE = {
  stroke: [
    '#1e1e28',
    '#5b6470',
    '#e03131',
    '#f08c00',
    '#f2c94c',
    '#2f9e44',
    '#0ca678',
    '#1971c2',
    '#6d5efc',
    '#ae3ec9',
    '#e64980',
    '#ffffff',
  ],
  background: [
    'transparent',
    '#ffe8e8',
    '#fff3bf',
    '#e6fcf5',
    '#e7f5ff',
    '#f3f0ff',
    '#ffe066',
    '#b2f2bb',
    '#a5d8ff',
    '#d0bfff',
    '#ffd8a8',
    '#1e1e28',
  ],
  sticky: ['#ffe066', '#ffc9c9', '#b2f2bb', '#a5d8ff', '#d0bfff', '#ffd8a8', '#ffec99', '#eebefa'],
};

const FILLS: { id: FillStyle; label: string }[] = [
  { id: 'hachure', label: 'Hachure' },
  { id: 'cross-hatch', label: 'Cross' },
  { id: 'solid', label: 'Solid' },
  { id: 'dots', label: 'Dots' },
  { id: 'zigzag', label: 'Zigzag' },
];

const STROKES: { id: StrokeStyle; label: string }[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'dashed', label: 'Dashed' },
  { id: 'dotted', label: 'Dotted' },
];

const WIDTHS = [
  { v: 1, label: 'Thin' },
  { v: 2, label: 'Medium' },
  { v: 4, label: 'Bold' },
  { v: 8, label: 'Extra' },
];

const HEAD_OPTIONS: ArrowHead[] = ['none', 'arrow', 'triangle', 'circle', 'bar'];

const DRAWING_TOOLS = [
  'pen',
  'pencil',
  'highlighter',
  'rectangle',
  'diamond',
  'ellipse',
  'arrow',
  'line',
  'text',
  'sticky',
  'frame',
];

export default function PropertiesPanel() {
  const app = useBoard((s) => s.app);
  const elements = useBoard((s) => s.elements);
  const setApp = useBoard((s) => s.setApp);
  const updateElements = useBoard((s) => s.updateElements);
  const pushHistory = useBoard((s) => s.pushHistory);
  const deleteSelection = useBoard((s) => s.deleteSelection);
  const ref = useRef<HTMLDivElement>(null);

  const selection = elements.filter((e) => app.selection.includes(e.id));
  const hasSel = selection.length > 0;
  const first = selection[0];

  useEffect(() => {
    if (!hasSel) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const el = e.target as HTMLElement;
        if (el.closest('.canvas-wrap') || el.closest('.topbar') || el.closest('.toolbar') || el.closest('.library-panel')) return;
        setApp({ showProperties: false });
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [hasSel, setApp]);

  const patch = (p: Record<string, unknown>) => {
    pushHistory('style');
    updateElements(app.selection, () => p);
    setApp(p as never);
  };

  const activeStroke = first ? first.strokeColor : app.strokeColor;
  const activeBg = first ? first.backgroundColor : app.backgroundColor;
  const activeFill = first ? first.fillStyle : app.fillStyle;
  const activeStrokeWidth = first ? first.strokeWidth : app.strokeWidth;
  const activeStrokeStyle = first ? first.strokeStyle : app.strokeStyle;
  const activeOpacity = first ? first.opacity : app.opacity;
  const isSticky = first?.type === 'sticky';
  const isLinear = first?.type === 'arrow' || first?.type === 'line';
  const isText = first?.type === 'text';
  const isShape = first && ['rectangle', 'diamond', 'ellipse'].includes(first.type);

  /* Visible when a drawing tool is active (tool defaults), or when something is
     selected and the user has not dismissed the panel for this selection. */
  const drawingTool = DRAWING_TOOLS.includes(app.tool);
  const selKey = app.selection.join(',');
  const [dismissed, setDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (selKey) setDismissed(null);
  }, [selKey]);
  const visible = app.showProperties || drawingTool || (hasSel && dismissed !== selKey);
  useEffect(() => {
    if (app.showProperties && !hasSel && !drawingTool) setApp({ showProperties: false });
  }, [app.showProperties, hasSel, drawingTool, setApp]);
  if (!visible) return null;

  return (
    <div className="properties-panel" ref={ref}>
      <div className="panel-header">
        <span>
          <SlidersHorizontal size={14} /> {hasSel ? `${selection.length} selected` : 'Style'}
        </span>
        <div className="panel-header-actions">
          {hasSel && (
            <button onClick={deleteSelection} title="Delete selection">
              <Trash2 size={14} />
            </button>
          )}
          <button
            onClick={() => {
              if (hasSel) setDismissed(selKey);
              setApp({ showProperties: false, tool: hasSel ? app.tool : 'select' });
            }}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <Section title="Stroke" icon={<Palette size={13} />}>
        <div className="swatch-grid">
          {PALETTE.stroke.map((c) => (
            <button
              key={c}
              className={`swatch ${activeStroke === c ? 'active' : ''}`}
              style={{ background: c }}
              onClick={() => patch({ strokeColor: c })}
              title={c}
            />
          ))}
          <label className="swatch custom" title="Custom color">
            <input
              type="color"
              value={activeStroke.startsWith('#') ? activeStroke : '#1e1e28'}
              onChange={(e) => patch({ strokeColor: e.target.value })}
            />
            +
          </label>
        </div>
      </Section>

      {!isText && !isLinear && (
        <Section title={isSticky ? 'Note color' : 'Fill'} icon={<PaintBucket size={13} />}>
          <div className="swatch-grid">
            {(isSticky ? PALETTE.sticky : PALETTE.background).map((c) => (
              <button
                key={c}
                className={`swatch ${activeBg === c ? 'active' : ''} ${c === 'transparent' ? 'transparent' : ''}`}
                style={{ background: c === 'transparent' ? undefined : c }}
                onClick={() => patch({ backgroundColor: c })}
                title={c === 'transparent' ? 'No fill' : c}
              />
            ))}
          </div>
        </Section>
      )}

      {isShape && (
        <Section title="Fill style" icon={<Layers size={13} />}>
          <div className="chip-row">
            {FILLS.map((f) => (
              <button
                key={f.id}
                className={`chip ${activeFill === f.id ? 'active' : ''}`}
                onClick={() => patch({ fillStyle: f.id })}
              >
                {f.label}
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title="Stroke width">
        <div className="chip-row">
          {WIDTHS.map((w) => (
            <button
              key={w.v}
              className={`chip width-chip ${activeStrokeWidth === w.v ? 'active' : ''}`}
              onClick={() => patch({ strokeWidth: w.v })}
              title={w.label}
            >
              <span style={{ height: w.v, width: 22, background: 'currentColor', borderRadius: 4, display: 'block' }} />
            </button>
          ))}
        </div>
      </Section>

      <Section title="Stroke style">
        <div className="chip-row">
          {STROKES.map((s) => (
            <button
              key={s.id}
              className={`chip ${activeStrokeStyle === s.id ? 'active' : ''}`}
              onClick={() => patch({ strokeStyle: s.id })}
            >
              <span className={`stroke-preview ${s.id}`} />
              {s.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Sloppiness">
        <input
          type="range"
          min={0}
          max={2.5}
          step={0.1}
          value={first?.roughness ?? app.roughness}
          onChange={(e) => patch({ roughness: Number(e.target.value) })}
        />
      </Section>

      <Section title="Opacity">
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={activeOpacity}
          onChange={(e) => updateElements(app.selection, () => ({ opacity: Number(e.target.value) }))}
          onPointerUp={() => pushHistory('opacity')}
        />
      </Section>

      {isLinear && (
        <>
          <Section title="Arrowheads">
            <div className="chip-row">
              {HEAD_OPTIONS.map((h) => (
                <button
                  key={`start-${h}`}
                  className={`chip ${(first as { startArrowhead: ArrowHead }).startArrowhead === h ? 'active' : ''}`}
                  onClick={() => patch({ startArrowhead: h })}
                  title={`Start: ${h}`}
                >
                  ←
                </button>
              ))}
            </div>
            <div className="chip-row">
              {HEAD_OPTIONS.map((h) => (
                <button
                  key={`end-${h}`}
                  className={`chip ${(first as { endArrowhead: ArrowHead }).endArrowhead === h ? 'active' : ''}`}
                  onClick={() => patch({ endArrowhead: h })}
                  title={`End: ${h}`}
                >
                  →
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      {isText && (
        <>
          <Section title="Font size">
            <div className="chip-row">
              {[14, 16, 20, 24, 32, 40, 56, 72].map((s) => (
                <button
                  key={s}
                  className={`chip ${(first as { fontSize: number }).fontSize === s ? 'active' : ''}`}
                  onClick={() => patch({ fontSize: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Font family">
            <div className="chip-row">
              {[
                { id: 'hand', label: 'Hand' },
                { id: 'casual', label: 'Casual' },
                { id: 'marker', label: 'Marker' },
                { id: 'sans', label: 'Sans' },
                { id: 'mono', label: 'Mono' },
              ].map((f) => (
                <button
                  key={f.id}
                  className={`chip ${(first as { fontFamily: string }).fontFamily === f.id ? 'active' : ''}`}
                  onClick={() => patch({ fontFamily: f.id })}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </Section>
          <Section title="Align">
            <div className="chip-row">
              {(['left', 'center', 'right'] as TextAlign[]).map((al) => (
                <button
                  key={al}
                  className={`chip ${(first as { textAlign: TextAlign }).textAlign === al ? 'active' : ''}`}
                  onClick={() => patch({ textAlign: al })}
                >
                  {al === 'left' ? '⟸' : al === 'center' ? '⇔' : '⟹'}
                </button>
              ))}
            </div>
          </Section>
        </>
      )}

      <Section title="Shape corners">
        <div className="chip-row">
          <button className={`chip ${(first as { roundness: number })?.roundness ? 'active' : ''}`} onClick={() => patch({ roundness: 18 })}>
            <ChevronDown size={12} /> Round
          </button>
          <button className={`chip ${!(first as { roundness: number })?.roundness ? 'active' : ''}`} onClick={() => patch({ roundness: 0 })}>
            Sharp
          </button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel-section">
      <div className="section-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
