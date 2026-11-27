import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileImage,
  FileJson,
  FileText,
  Loader2,
  Presentation,
  Settings2,
  X,
} from 'lucide-react';
import { useBoard } from '../store/board';
import {
  copyPngToClipboard,
  download,
  exportJSON,
  exportPDF,
  exportPNG,
  exportPPTX,
  exportSVG,
  slug,
} from '../utils/export';
import { unionBounds, elementBounds } from '../utils/geometry';

type Format = 'png' | 'svg' | 'pdf' | 'pptx' | 'json';

const FORMATS: { id: Format; label: string; desc: string; icon: React.ReactNode }[] = [
  { id: 'png', label: 'PNG image', desc: 'Best for sharing a picture', icon: <FileImage size={18} /> },
  { id: 'svg', label: 'SVG vector', desc: 'Infinite zoom, editable', icon: <Settings2 size={18} /> },
  { id: 'pdf', label: 'PDF document', desc: 'Print-ready page', icon: <FileText size={18} /> },
  { id: 'pptx', label: 'PowerPoint', desc: 'One frame per slide', icon: <Presentation size={18} /> },
  { id: 'json', label: 'Board file', desc: 'Re-importable backup', icon: <FileJson size={18} /> },
];

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const elements = useBoard((s) => s.elements);
  const app = useBoard((s) => s.app);
  const boardName = useBoard((s) => s.boardName);
  const boardId = useBoard((s) => s.boardId);
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState(2);
  const [withBg, setWithBg] = useState(true);
  const [selectionOnly, setSelectionOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const target = useMemo(() => {
    if (selectionOnly && app.selection.length) {
      return elements.filter((e) => app.selection.includes(e.id));
    }
    return elements;
  }, [elements, app.selection, selectionOnly]);

  const frames = elements.filter((e) => e.type === 'frame');

  const opts = {
    scale,
    background: app.theme === 'dark' ? '#0f1016' : '#ffffff',
    transparent: !withBg,
    padding: 32,
    theme: app.theme,
  };

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!target.length) {
        setError('Nothing to export yet — draw something first.');
        setBusy(false);
        return;
      }
      switch (format) {
        case 'png': {
          const blob = await exportPNG(target, opts);
          download(blob, `${slug(boardName)}.png`);
          break;
        }
        case 'svg': {
          const svg = exportSVG(target, withBg ? opts.background : 'none', 32);
          download(new Blob([svg], { type: 'image/svg+xml' }), `${slug(boardName)}.svg`);
          break;
        }
        case 'pdf': {
          const blob = await exportPDF(target, opts, { name: boardName });
          download(blob, `${slug(boardName)}.pdf`);
          break;
        }
        case 'pptx': {
          const blob = await exportPPTX(target, opts, { name: boardName });
          download(blob, `${slug(boardName)}.pptx`);
          break;
        }
        case 'json': {
          exportJSON({
            id: boardId,
            name: boardName,
            elements,
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
          });
          break;
        }
        default:
          break;
      }
      onClose();
    } catch (err) {
      console.error(err);
      setError('Export failed. Try a different format or a smaller area.');
    } finally {
      setBusy(false);
    }
  };

  const copyImage = async () => {
    setBusy(true);
    setError(null);
    const ok = await copyPngToClipboard(target, opts);
    setBusy(false);
    setCopied(ok);
    if (!ok) setError('Clipboard images are blocked in this browser — download instead.');
    else setTimeout(() => setCopied(false), 2200);
  };

  const b = target.length ? unionBounds(target.map((e) => elementBounds(e))) : { width: 0, height: 0 };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal export-modal">
        <div className="modal-head">
          <div>
            <h2>Export board</h2>
            <p className="muted">
              {target.length} element{target.length === 1 ? '' : 's'} · {Math.round(b.width)}×{Math.round(b.height)} px area
              {frames.length > 0 && format === 'pptx' ? ` · ${frames.length} frames → slides` : ''}
            </p>
          </div>
          <button className="ghost-btn icon-only" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        <div className="format-grid">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              className={`format-card ${format === f.id ? 'active' : ''}`}
              onClick={() => setFormat(f.id)}
            >
              <span className="format-icon">{f.icon}</span>
              <span className="format-label">{f.label}</span>
              <span className="format-desc">{f.desc}</span>
              {format === f.id && (
                <span className="format-check">
                  <Check size={12} />
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="export-options">
          {(format === 'png' || format === 'pdf' || format === 'pptx') && (
            <label className="option-row">
              <span>Resolution</span>
              <div className="segmented">
                {[1, 2, 3, 4].map((s) => (
                  <button key={s} className={scale === s ? 'active' : ''} onClick={() => setScale(s)}>
                    {s}×
                  </button>
                ))}
              </div>
            </label>
          )}
          {format !== 'json' && format !== 'pptx' && (
            <label className="option-row">
              <span>Background</span>
              <div className="segmented">
                <button className={withBg ? 'active' : ''} onClick={() => setWithBg(true)}>
                  Paper
                </button>
                <button className={!withBg ? 'active' : ''} onClick={() => setWithBg(false)}>
                  Transparent
                </button>
              </div>
            </label>
          )}
          {app.selection.length > 0 && (
            <label className="option-row">
              <span>Area</span>
              <div className="segmented">
                <button className={!selectionOnly ? 'active' : ''} onClick={() => setSelectionOnly(false)}>
                  Whole board
                </button>
                <button className={selectionOnly ? 'active' : ''} onClick={() => setSelectionOnly(true)}>
                  Selection
                </button>
              </div>
            </label>
          )}
        </div>

        {format === 'pptx' && frames.length === 0 && (
          <p className="hint">
            Tip: draw <strong>frames</strong> (F) around groups of content to control slides. Without frames, elements
            are auto-distributed across slides.
          </p>
        )}

        {error && <p className="error-text">{error}</p>}

        <div className="modal-actions">
          {format === 'png' && (
            <button className="secondary-btn" onClick={copyImage} disabled={busy}>
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copied' : 'Copy image'}
            </button>
          )}
          <span className="spacer" />
          <button className="ghost-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={run} disabled={busy}>
            {busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
            {busy ? 'Preparing…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  );
}
