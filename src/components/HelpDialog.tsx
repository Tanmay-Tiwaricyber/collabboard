import { X } from 'lucide-react';

const SHORTCUTS: [string, string][] = [
  ['V', 'Select / move'],
  ['H', 'Pan (or hold Space)'],
  ['P', 'Pen — pressure-sensitive ink'],
  ['B', 'Pencil — thin, textured'],
  ['M', 'Highlighter'],
  ['E', 'Eraser'],
  ['R', 'Rectangle'],
  ['D', 'Diamond'],
  ['O', 'Ellipse'],
  ['A', 'Arrow (binds to shapes)'],
  ['L', 'Line'],
  ['T', 'Text'],
  ['N', 'Sticky note'],
  ['F', 'Frame / slide'],
  ['I', 'Insert image'],
  ['K', 'Laser pointer'],
  ['1 – 4', 'Stroke width'],
  ['Ctrl/⌘ Z', 'Undo'],
  ['Ctrl/⌘ ⇧ Z', 'Redo'],
  ['Ctrl/⌘ A', 'Select all'],
  ['Ctrl/⌘ D', 'Duplicate'],
  ['Ctrl/⌘ C / V', 'Copy / paste (also images & text)'],
  ['Ctrl/⌘ S', 'Save to browser'],
  ['Ctrl/⌘ P', 'Present frames as slides'],
  ['Ctrl/⌘ 0', 'Reset zoom'],
  ['Ctrl/⌘ + / −', 'Zoom in / out'],
  ['Wheel / Trackpad', 'Pan canvas'],
  ['Ctrl + Wheel', 'Zoom at cursor'],
  ['Shift + drag', 'Constrain to square / 45° / axis'],
  ['Alt + drag', 'Disable snapping'],
  ['Double click', 'Edit text or add label'],
  ['Right click', 'Context menu'],
  ['Enter (in text)', 'New line · ⌘Enter to finish'],
];

const FEATURES: [string, string][] = [
  ['Infinite canvas', 'Pan, zoom (5%–2400%) and draw forever — no page edges.'],
  ['Handwriting', 'Pen, pencil and highlighter with real pressure support and smoothing.'],
  ['Shapes & diagrams', 'Rough, hand-drawn looking rectangles, diamonds, ellipses, arrows and lines.'],
  ['Smart arrows', 'Arrows snap and stay bound to the shapes they point at.'],
  ['Text & sticky notes', 'Multi-line text, auto-wrap, five handwriting fonts, colored notes.'],
  ['Frames', 'Group content into slides — each frame becomes a PowerPoint slide on export.'],
  ['Export', 'PNG, SVG, PDF, PPTX and re-importable board files. Copy straight to clipboard too.'],
  ['Share links', 'Whole board compressed into the URL (works with no server), plus QR and embed code.'],
  ['Libraries', 'Boards autosave in the browser with thumbnails you can reopen any time.'],
  ['Themes', 'Light and dark canvas with dot, grid or lined paper.'],
];

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal help-modal">
        <div className="modal-head">
          <div>
            <h2>CollabBoard</h2>
            <p className="muted">An infinite whiteboard for sketched notes, diagrams and quick design work.</p>
          </div>
          <button className="ghost-btn icon-only" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="help-columns">
          <div>
            <h3>Keyboard shortcuts</h3>
            <table className="shortcut-table">
              <tbody>
                {SHORTCUTS.map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <kbd>{k}</kbd>
                    </td>
                    <td>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3>Everything you can do</h3>
            <ul className="feature-list">
              {FEATURES.map(([title, desc]) => (
                <li key={title}>
                  <strong>{title}</strong>
                  <span>{desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="modal-actions">
          <span className="spacer" />
          <button className="primary-btn" onClick={onClose}>
            Back to board
          </button>
        </div>
      </div>
    </div>
  );
}
