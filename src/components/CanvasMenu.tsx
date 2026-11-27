import { useEffect, useRef, useState } from 'react';
import {
  Grid2x2,
  Rows3,
  Sparkles,
  Square,
  Sun,
  Moon,
  Baseline,
  Magnet,
  Frame,
  Scan,
} from 'lucide-react';
import { useBoard } from '../store/board';
import type { BackgroundPattern } from '../types';

const PATTERNS: { id: BackgroundPattern; label: string; icon: React.ReactNode }[] = [
  { id: 'dots', label: 'Dots', icon: <Sparkles size={15} /> },
  { id: 'grid', label: 'Grid', icon: <Grid2x2 size={15} /> },
  { id: 'lines', label: 'Lines', icon: <Rows3 size={15} /> },
  { id: 'none', label: 'Blank', icon: <Square size={15} /> },
];

export default function CanvasMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const app = useBoard((s) => s.app);
  const setApp = useBoard((s) => s.setApp);
  const elements = useBoard((s) => s.elements);
  const frames = elements.filter((e) => e.type === 'frame').length;

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <div className="canvas-menu-wrap" ref={ref}>
      <button
        className={`canvas-menu-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Canvas settings"
        aria-label="Canvas settings"
      >
        <Grid2x2 size={16} />
      </button>
      {open && (
        <div className="canvas-menu">
          <div className="cm-title">Paper</div>
          <div className="cm-row">
            {PATTERNS.map((p) => (
              <button
                key={p.id}
                className={`cm-chip ${app.backgroundPattern === p.id ? 'active' : ''}`}
                onClick={() => setApp({ backgroundPattern: p.id })}
                title={p.label}
              >
                {p.icon}
                <span>{p.label}</span>
              </button>
            ))}
          </div>
          <div className="cm-title">Theme</div>
          <div className="cm-row">
            <button
              className={`cm-chip ${app.theme === 'light' ? 'active' : ''}`}
              onClick={() => setApp({ theme: 'light', strokeColor: app.strokeColor === '#f2f2f7' ? '#1e1e28' : app.strokeColor })}
            >
              <Sun size={15} /> <span>Light</span>
            </button>
            <button
              className={`cm-chip ${app.theme === 'dark' ? 'active' : ''}`}
              onClick={() => setApp({ theme: 'dark', strokeColor: app.strokeColor === '#1e1e28' ? '#f2f2f7' : app.strokeColor })}
            >
              <Moon size={15} /> <span>Dark</span>
            </button>
          </div>
          <div className="cm-title">Snapping</div>
          <div className="cm-row">
            <button
              className={`cm-chip ${app.snapToGrid ? 'active' : ''}`}
              onClick={() => setApp({ snapToGrid: !app.snapToGrid })}
              title="Snap to grid"
            >
              <Magnet size={15} /> <span>Grid</span>
            </button>
            <button className="cm-chip" onClick={() => setApp({ showHelp: true })} title="Shortcuts">
              <Baseline size={15} /> <span>Shortcuts</span>
            </button>
          </div>
          <div className="cm-sep" />
          <button className="cm-wide" onClick={() => window.dispatchEvent(new Event('collabboard:zoomfit'))}>
            <Scan size={15} /> Zoom to fit all
          </button>
          <button
            className="cm-wide"
            onClick={() => {
              setApp({ tool: 'frame' });
              setOpen(false);
            }}
          >
            <Frame size={15} /> Draw a frame {frames ? `· ${frames} on board` : ''}
          </button>
        </div>
      )}
    </div>
  );
}
