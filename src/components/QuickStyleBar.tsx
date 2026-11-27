import { useState } from 'react';
import { ArrowUpRight, ChevronRight, Palette, Pencil, Type, X } from 'lucide-react';
import { useBoard } from '../store/board';
import { PALETTE } from './PropertiesPanel';
import { fontStack } from '../utils/geometry';

const WIDTHS = [
  { v: 1, label: 'Thin' },
  { v: 2, label: 'Medium' },
  { v: 4, label: 'Bold' },
  { v: 8, label: 'Extra bold' },
];

const FONTS = [
  { id: 'hand', label: 'Hand' },
  { id: 'casual', label: 'Casual' },
  { id: 'marker', label: 'Marker' },
  { id: 'sans', label: 'Sans' },
  { id: 'mono', label: 'Mono' },
];

/** Compact always-visible style bar for pen/ink tools (Excalidraw's quick strip). */
export default function QuickStyleBar() {
  const app = useBoard((s) => s.app);
  const setApp = useBoard((s) => s.setApp);
  const elements = useBoard((s) => s.elements);
  const updateElements = useBoard((s) => s.updateElements);
  const selection = elements.filter((e) => app.selection.includes(e.id));
  const first = selection[0];
  const [open, setOpen] = useState<'color' | 'width' | 'font' | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const inkTools = ['pen', 'pencil', 'highlighter'];
  const isInk = inkTools.includes(app.tool);
  if (!isInk && !selection.length) return null;
  if (dismissed) return null;

  const strokeColor = first ? first.strokeColor : app.strokeColor;
  const strokeWidth = first ? first.strokeWidth : app.strokeWidth;
  const fontSize = first && first.type === 'text' ? first.fontSize : app.fontSize;
  const fontFamily = first && 'fontFamily' in first ? (first as { fontFamily: string }).fontFamily : app.fontFamily;

  const apply = (patch: Record<string, unknown>) => {
    if (selection.length) {
      useBoard.getState().pushHistory('style');
      updateElements(app.selection, () => patch as never);
      return;
    }
    setApp(patch as never);
  };

  return (
    <div className="quick-style" role="toolbar" aria-label="Quick style">
      <button className="qs-close" onClick={() => setDismissed(true)} title="Hide">
        <X size={12} />
      </button>

      <div className="qs-group">
        <button
          className={`qs-btn ${open === 'color' ? 'active' : ''}`}
          onClick={() => setOpen(open === 'color' ? null : 'color')}
          title="Stroke colour"
        >
          <span className="qs-dot" style={{ background: strokeColor }} />
          <Palette size={13} className="qs-badge" />
        </button>
        <button
          className={`qs-btn ${open === 'width' ? 'active' : ''}`}
          onClick={() => setOpen(open === 'width' ? null : 'width')}
          title="Stroke width"
        >
          <Pencil size={15} />
          <span className="qs-value">{strokeWidth}</span>
        </button>
        {(isInk || first?.type === 'text' || first?.type === 'sticky' || app.tool === 'text') && (
          <button
            className={`qs-btn ${open === 'font' ? 'active' : ''}`}
            onClick={() => setOpen(open === 'font' ? null : 'font')}
            title="Font"
          >
            <Type size={15} />
            <span className="qs-value" style={{ fontFamily: fontStack(fontFamily) }}>
              Aa
            </span>
          </button>
        )}
      </div>

      {open && (
        <div className="qs-pop">
          {open === 'color' && (
            <div className="qs-palette">
              {PALETTE.stroke.map((c) => (
                <button
                  key={c}
                  className={`swatch ${strokeColor === c ? 'active' : ''}`}
                  style={{ background: c }}
                  onClick={() => apply({ strokeColor: c })}
                  title={c}
                />
              ))}
              <label className="swatch custom" title="Custom colour">
                <input
                  type="color"
                  value={strokeColor.startsWith('#') ? strokeColor : '#1e1e28'}
                  onChange={(e) => apply({ strokeColor: e.target.value })}
                />
                +
              </label>
            </div>
          )}
          {open === 'width' && (
            <div className="qs-widths">
              {WIDTHS.map((w) => (
                <button
                  key={w.v}
                  className={`qs-width ${strokeWidth === w.v ? 'active' : ''}`}
                  onClick={() => apply({ strokeWidth: w.v })}
                  title={w.label}
                >
                  <span style={{ height: w.v, background: 'currentColor' }} />
                  <em>{w.label}</em>
                </button>
              ))}
            </div>
          )}
          {open === 'font' && (
            <div className="qs-fonts">
              {FONTS.map((f) => (
                <button
                  key={f.id}
                  className={`qs-font ${fontFamily === f.id ? 'active' : ''}`}
                  style={{ fontFamily: fontStack(f.id) }}
                  onClick={() => apply({ fontFamily: f.id })}
                >
                  {f.label}
                </button>
              ))}
              <div className="qs-fontsize">
                {[14, 18, 24, 32, 44].map((s) => (
                  <button
                    key={s}
                    className={fontSize === s ? 'active' : ''}
                    onClick={() => apply({ fontSize: s })}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <span className="qs-hint">
        {first ? `${selection.length} selected` : 'Style for new ink'}
        <ChevronRight size={11} />
      </span>
      <button
        className="qs-btn"
        onClick={() => setApp({ showProperties: true })}
        title="All properties"
      >
        <ArrowUpRight size={14} />
      </button>
    </div>
  );
}
