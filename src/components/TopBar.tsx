import { useEffect, useRef, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Command,
  Download,
  HelpCircle,
  LayoutGrid,
  Moon,
  MoreHorizontal,
  Plus,
  Redo2,
  Share2,
  Sun,
  Undo2,
  Menu,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';
import { useBoard } from '../store/board';

interface Props {
  onShare: () => void;
  onExport: () => void;
  onLibrary: () => void;
  onHelp: () => void;
  onNew: () => void;
}

export default function TopBar({ onShare, onExport, onLibrary, onHelp, onNew }: Props) {
  const app = useBoard((s) => s.app);
  const boardName = useBoard((s) => s.boardName);
  const renameBoard = useBoard((s) => s.renameBoard);
  const undo = useBoard((s) => s.undo);
  const redo = useBoard((s) => s.redo);
  const history = useBoard((s) => s.history);
  const future = useBoard((s) => s.future);
  const dirty = useBoard((s) => s.dirty);
  const lastSavedAt = useBoard((s) => s.lastSavedAt);
  const setApp = useBoard((s) => s.setApp);
  const save = useBoard((s) => s.save);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(boardName);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setName(boardName), [boardName]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    const handler = () => setMenuOpen((v) => !v);
    window.addEventListener('collabboard:moremenu', handler);
    return () => window.removeEventListener('collabboard:moremenu', handler);
  }, []);

  const commitName = () => {
    setEditingName(false);
    if (name.trim() && name !== boardName) renameBoard(name.trim());
    else setName(boardName);
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="brand" onClick={onNew} title="New board">
          <span className="brand-mark">
            <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden>
              <rect width="32" height="32" rx="9" fill="url(#g)" />
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#7c6cff" />
                  <stop offset="1" stopColor="#ff5c9d" />
                </linearGradient>
              </defs>
              <path d="M7 22c3-9 5-13 8-13s2 8 4 8 3-5 6-8" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" fill="none" />
            </svg>
          </span>
          <span className="brand-text">CollabBoard</span>
        </button>
        <span className="topbar-sep" />
        <button className="ghost-btn icon-only" onClick={onLibrary} title="All boards">
          <LayoutGrid size={17} />
        </button>
        {editingName ? (
          <input
            autoFocus
            className="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitName();
              if (e.key === 'Escape') {
                setName(boardName);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button className="name-btn" onClick={() => setEditingName(true)} title="Rename board">
            {boardName}
          </button>
        )}
        <span
          className={`save-state ${dirty ? 'dirty' : 'saved'}`}
          title={
            dirty
              ? 'Not saved yet. If this board holds large images your browser storage may be full — export a board file instead.'
              : lastSavedAt
                ? `Saved in this browser at ${new Date(lastSavedAt).toLocaleTimeString()}`
                : 'Draft'
          }
        >
          {dirty ? <CloudOff size={13} /> : <Cloud size={13} />}
          {dirty ? 'Unsaved' : lastSavedAt ? 'Saved' : 'Draft'}
        </span>
      </div>

      <div className="topbar-right">
        <div className="undo-group">
          <button className="ghost-btn icon-only" onClick={undo} disabled={!history.length} title="Undo (Ctrl Z)">
            <Undo2 size={17} />
          </button>
          <button className="ghost-btn icon-only" onClick={redo} disabled={!future.length} title="Redo (Ctrl Shift Z)">
            <Redo2 size={17} />
          </button>
        </div>
        <button
          className="ghost-btn icon-only theme-toggle"
          onClick={() => {
            const theme = app.theme === 'dark' ? 'light' : 'dark';
            setApp({ theme, strokeColor: theme === 'dark' ? '#f2f2f7' : '#1e1e28' });
          }}
          title="Toggle theme"
        >
          {app.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
        <button className="ghost-btn icon-only" onClick={onHelp} title="Shortcuts (?)">
          <HelpCircle size={17} />
        </button>
        <button className="ghost-btn icon-only mobile-hide" onClick={() => setApp({ showProperties: !app.showProperties })} title="Properties">
          {app.showProperties ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
        <button className="secondary-btn" onClick={onExport} title="Export board">
          <Download size={16} /> <span className="label">Export</span>
        </button>
        <button className="primary-btn" onClick={onShare} title="Share board">
          <Share2 size={16} /> <span className="label">Share</span>
        </button>
        <div className="more-wrap" ref={menuRef}>
          <button className="ghost-btn icon-only" onClick={() => setMenuOpen((v) => !v)} title="More">
            <MoreHorizontal size={18} />
          </button>
          {menuOpen && (
            <div className="more-menu">
              <button onClick={() => { save(); setMenuOpen(false); }}>
                <Check size={14} /> Save to browser
              </button>
              <button onClick={() => { onNew(); setMenuOpen(false); }}>
                <Plus size={14} /> New board
              </button>
              <button onClick={() => { onLibrary(); setMenuOpen(false); }}>
                <LayoutGrid size={14} /> All boards
              </button>
              <button onClick={() => { onExport(); setMenuOpen(false); }}>
                <Download size={14} /> Export
              </button>
              <button onClick={() => { onHelp(); setMenuOpen(false); }}>
                <Command size={14} /> Keyboard shortcuts
              </button>
              <button onClick={() => { onHelp(); setMenuOpen(false); }}>
                <Menu size={14} /> About this app
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
