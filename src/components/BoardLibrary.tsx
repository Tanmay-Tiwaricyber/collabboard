import { useEffect, useMemo, useState } from 'react';
import { Copy, Plus, Search, Trash2, X, LayoutGrid, Clock, Upload } from 'lucide-react';
import { loadIndex, readBoard, writeBoard, useBoard } from '../store/board';
import type { BoardDocument, BoardMeta } from '../types';
import { makeThumbnail } from '../utils/export';
import { nanoid } from '../utils/geometry';

interface Props {
  onClose: () => void;
  onOpen: (id: string) => void;
  onNew: () => void;
}

export default function BoardLibrary({ onClose, onOpen, onNew }: Props) {
  const currentId = useBoard((s) => s.boardId);
  const elements = useBoard((s) => s.elements);
  const app = useBoard((s) => s.app);
  const boardName = useBoard((s) => s.boardName);
  const save = useBoard((s) => s.save);
  const [items, setItems] = useState<BoardMeta[]>([]);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = () => setItems(loadIndex());
  useEffect(refresh, []);

  const filtered = useMemo(
    () => items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())),
    [items, query],
  );

  const snapshotCurrent = async () => {
    save();
    const thumb = await makeThumbnail(elements, app.theme);
    const doc = readBoard(currentId);
    if (doc) writeBoard({ ...doc, thumbnail: thumb || doc.thumbnail });
    refresh();
  };

  const duplicate = async (id: string) => {
    const doc = readBoard(id);
    if (!doc) return;
    const copy = {
      ...doc,
      id: nanoid(10),
      name: `${doc.name} copy`,
      updatedAt: Date.now(),
      createdAt: Date.now(),
    };
    writeBoard(copy);
    refresh();
  };

  const remove = (id: string) => {
    localStorage.removeItem(`collabboard:v1:board:${id}`);
    const index = loadIndex().filter((i) => i.id !== id);
    localStorage.setItem('collabboard:v1:index', JSON.stringify(index));
    refresh();
  };

  const openBoard = (id: string) => {
    if (id === currentId) {
      onClose();
      return;
    }
    save();
    onOpen(id);
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal library-modal">
        <div className="modal-head">
          <div>
            <h2>
              <LayoutGrid size={18} /> Your boards
            </h2>
            <p className="muted">Saved locally in this browser. Share a link to move a board between devices.</p>
          </div>
          <div className="head-actions">
            <button className="secondary-btn" onClick={async () => { setBusy(true); await snapshotCurrent(); setBusy(false); }} disabled={busy}>
              {busy ? 'Saving…' : 'Save current'}
            </button>
            <button className="ghost-btn icon-only" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="library-toolbar">
          <div className="search-box">
            <Search size={15} />
            <input placeholder="Search boards…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <label className="secondary-btn import-btn" title="Open an exported .collabboard.json file">
            <Upload size={15} /> Import
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  const raw = await file.text();
                  const doc = JSON.parse(raw) as BoardDocument;
                  if (!doc || !Array.isArray(doc.elements)) throw new Error('not a board file');
                  save();
                  const id = nanoid(10);
                  writeBoard({ ...doc, id, updatedAt: Date.now(), createdAt: Date.now() });
                  refresh();
                  onOpen(id);
                } catch {
                  alert('That file is not a valid CollabBoard export.');
                }
              }}
            />
          </label>
          <button
            className="primary-btn"
            onClick={() => {
              save();
              onNew();
            }}
          >
            <Plus size={15} /> New board
          </button>
        </div>

        <div className="library-grid">
          <button className="library-card new-card" onClick={() => { save(); onNew(); }}>
            <div className="new-card-inner">
              <Plus size={26} />
              <span>Blank board</span>
            </div>
          </button>
          {filtered.map((item) => (
            <div key={item.id} className={`library-card ${item.id === currentId ? 'current' : ''}`}>
              <button className="card-preview" onClick={() => openBoard(item.id)}>
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt={item.name} />
                ) : (
                  <div className="thumb-empty">
                    <LayoutGrid size={22} />
                  </div>
                )}
              </button>
              <div className="card-meta">
                <div className="card-title" title={item.name}>
                  {item.name}
                  {item.id === currentId && <span className="badge">open</span>}
                </div>
                <div className="card-sub">
                  <Clock size={11} />
                  {new Date(item.updatedAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span className="dot" />
                  {item.elementCount} el.
                </div>
              </div>
              <div className="card-actions">
                <button title="Duplicate" onClick={() => duplicate(item.id)}>
                  <Copy size={14} />
                </button>
                <button title="Delete" onClick={() => remove(item.id)} className="danger">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && !query && (
            <p className="empty-note muted">
              No saved boards yet. Boards autosave as you draw — the current one is “{boardName}”.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
