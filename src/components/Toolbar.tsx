import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Frame,
  Hand,
  Highlighter,
  Image as ImageIcon,
  Lock,
  Minus,
  MousePointer2,
  Pencil,
  Pen,
  Square,
  StickyNote,
  Type,
  Video,
  Unlock,
  Sparkles,
} from 'lucide-react';
import { useBoard } from '../store/board';
import type { ToolType } from '../types';
import { useState } from 'react';

interface ToolDef {
  id: ToolType;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const groups: ToolDef[][] = [
  [
    { id: 'select', label: 'Select', shortcut: 'V', icon: <MousePointer2 size={19} /> },
    { id: 'hand', label: 'Pan', shortcut: 'H', icon: <Hand size={19} /> },
  ],
  [
    { id: 'pen', label: 'Pen', shortcut: 'P', icon: <Pen size={19} /> },
    { id: 'pencil', label: 'Pencil', shortcut: 'B', icon: <Pencil size={19} /> },
    { id: 'highlighter', label: 'Highlighter', shortcut: 'M', icon: <Highlighter size={19} /> },
    { id: 'eraser', label: 'Eraser', shortcut: 'E', icon: <Eraser size={19} /> },
  ],
  [
    { id: 'rectangle', label: 'Rectangle', shortcut: 'R', icon: <Square size={19} /> },
    { id: 'diamond', label: 'Diamond', shortcut: 'D', icon: <Diamond size={19} /> },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'O', icon: <Circle size={19} /> },
    { id: 'arrow', label: 'Arrow', shortcut: 'A', icon: <ArrowUpRight size={19} /> },
    { id: 'line', label: 'Line', shortcut: 'L', icon: <Minus size={19} /> },
  ],
  [
    { id: 'text', label: 'Text', shortcut: 'T', icon: <Type size={19} /> },
    { id: 'sticky', label: 'Sticky note', shortcut: 'N', icon: <StickyNote size={19} /> },
  ],
  [
    { id: 'frame', label: 'Frame / slide', shortcut: 'F', icon: <Frame size={19} /> },
    { id: 'laser', label: 'Laser pointer', shortcut: 'K', icon: <Sparkles size={19} /> },
  ],
];

export default function Toolbar() {
  const tool = useBoard((s) => s.app.tool);
  const lockTool = useBoard((s) => s.app.lockTool);
  const setTool = useBoard((s) => s.setTool);
  const setApp = useBoard((s) => s.setApp);
  const [showPresent, setShowPresent] = useState(false);

  return (
    <div className="toolbar" role="toolbar" aria-label="Drawing tools">
      {groups.map((group, gi) => (
        <div className="tool-group" key={gi}>
          {group.map((t) => (
            <button
              key={t.id}
              className={`tool-btn ${tool === t.id ? 'active' : ''}`}
              onClick={() => {
                if (t.id === 'image') {
                  document.getElementById('image-input')?.click();
                  return;
                }
                setTool(t.id);
              }}
              title={`${t.label} — ${t.shortcut}`}
              aria-label={t.label}
              aria-pressed={tool === t.id}
            >
              {t.icon}
              <span className="tool-tip">
                {t.label}
                <kbd>{t.shortcut}</kbd>
              </span>
            </button>
          ))}
          {gi === 3 && (
            <button
              className="tool-btn"
              onClick={() => document.getElementById('image-input')?.click()}
              title="Insert image — I"
              aria-label="Insert image"
            >
              <ImageIcon size={19} />
              <span className="tool-tip">
                Image
                <kbd>I</kbd>
              </span>
            </button>
          )}
        </div>
      ))}
      <div className="tool-group">
        <button
          className={`tool-btn ${lockTool ? 'active' : ''}`}
          onClick={() => setApp({ lockTool: !lockTool })}
          title={
            lockTool
              ? 'Tool stays active after each stroke — click to switch back to Select automatically'
              : 'Tools switch back to Select after each stroke — click to keep them active'
          }
          aria-label="Keep tool active"
          aria-pressed={lockTool}
        >
          {lockTool ? <Lock size={18} /> : <Unlock size={18} />}
          <span className="tool-tip">
            {lockTool ? 'Tool stays active' : 'Switch to Select after drawing'}
          </span>
        </button>
        <button
          className={`tool-btn ${showPresent ? 'active' : ''}`}
          onClick={() => {
            setShowPresent((v) => !v);
            window.dispatchEvent(new Event('collabboard:presentmenu'));
          }}
          title="Present"
          aria-label="Present"
        >
          <Video size={18} />
          <span className="tool-tip">Present</span>
        </button>
      </div>
    </div>
  );
}
