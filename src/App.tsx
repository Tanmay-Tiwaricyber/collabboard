import { useCallback, useEffect, useRef, useState } from 'react';
import Canvas from './components/Canvas';
import CanvasMenu from './components/CanvasMenu';
import Toolbar from './components/Toolbar';
import TopBar from './components/TopBar';
import PropertiesPanel from './components/PropertiesPanel';
import QuickStyleBar from './components/QuickStyleBar';
import ExportDialog from './components/ExportDialog';
import ShareDialog from './components/ShareDialog';
import BoardLibrary from './components/BoardLibrary';
import HelpDialog from './components/HelpDialog';
import PresentMode from './components/PresentMode';
import Toast from './components/Toast';
import { useBoard, readBoard } from './store/board';
import { documentFromShare, parseRoute, clearRoute } from './utils/share';
import { hydrateArrows } from './utils/bind';
import { loadIndex } from './store/board';

export default function App() {
  const [showExport, setShowExport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind?: 'info' | 'error' | 'success' } | null>(null);
  const [shared, setShared] = useState(false);
  const booted = useRef(false);
  const app = useBoard((s) => s.app);
  const setApp = useBoard((s) => s.setApp);
  const elements = useBoard((s) => s.elements);
  const save = useBoard((s) => s.save);

  const notify = useCallback((message: string, kind: 'info' | 'error' | 'success' = 'info') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 2800);
  }, []);

  /* ---------------------------- boot ----------------------------- */
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const route = parseRoute();
    const store = useBoard.getState();
    if (route.kind === 'share') {
      const doc = documentFromShare(route.payload);
      useBoard.setState({
        elements: hydrateArrows(doc.elements),
        boardName: doc.name,
        boardId: doc.id,
        app: { ...store.app, ...doc.appState, theme: doc.appState.theme, selection: [] },
        dirty: true,
      });
      setShared(true);
      notify('Shared board loaded — it is yours to edit. Use Save to keep a copy.', 'success');
    } else if (route.kind === 'local') {
      const doc = readBoard(route.id);
      if (doc) {
        store.loadBoard(route.id);
        notify('Board restored from this browser');
      } else {
        notify('That board link is not in this browser — starting a new board.', 'error');
      }
    } else {
      const index = loadIndex();
      if (index.length) {
        const last = readBoard(index[0].id);
        if (last) {
          store.loadBoard(index[0].id);
          notify(`Reopened “${last.name}”`);
        }
      }
    }
    // present-menu event from toolbar
    const openPresent = () => setPresenting(true);
    window.addEventListener('collabboard:presentmenu', openPresent);
    return () => window.removeEventListener('collabboard:presentmenu', openPresent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------- autosave --------------------------- */
  useEffect(() => {
    const id = setInterval(() => {
      const st = useBoard.getState();
      if (st.dirty && st.elements.length) st.save();
    }, 4000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onBeforeUnload = () => {
      const st = useBoard.getState();
      if (st.dirty) st.save();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = app.theme;
  }, [app.theme]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === '?' ) {
        setShowHelp(true);
      }
      if (e.key === 'Escape') {
        setShowExport(false);
        setShowShare(false);
        setShowLibrary(false);
        setShowHelp(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowExport(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setShowShare(true);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPresenting(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const newBoard = () => {
    save();
    useBoard.getState().newBoard();
    clearRoute();
    setShowLibrary(false);
    setShared(false);
  };

  return (
    <div className={`app theme-${app.theme}`}>
      <TopBar
        onShare={() => setShowShare(true)}
        onExport={() => setShowExport(true)}
        onLibrary={() => setShowLibrary(true)}
        onHelp={() => setShowHelp(true)}
        onNew={newBoard}
      />
      <main className="board-area">
        <Canvas />
        <Toolbar />
        <CanvasMenu />
        <PropertiesPanel />
        <QuickStyleBar />
        {shared && (
          <div className="shared-banner">
            Viewing a shared board — you can edit freely and save your own copy.
            <button onClick={() => setShared(false)}>Dismiss</button>
          </div>
        )}
        {elements.length === 0 && (
          <div className="empty-hint">
            <div className="empty-card">
              <h3>Start sketching</h3>
              <p>
                Press <kbd>P</kbd> to draw by hand, <kbd>R</kbd> for shapes, <kbd>T</kbd> for text or{' '}
                <kbd>N</kbd> for a sticky note. Drag anywhere to pan, <kbd>Ctrl</kbd>+scroll to zoom.
              </p>
            </div>
          </div>
        )}
        <button
          className="fab-props"
          style={{ display: app.selection.length ? 'flex' : 'none' }}
          onClick={() => setApp({ showProperties: true })}
        >
          Style
        </button>
      </main>

      {app.showHelp && !showHelp && <HelpDialog onClose={() => setApp({ showHelp: false })} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showShare && <ShareDialog onClose={() => setShowShare(false)} />}
      {showLibrary && (
        <BoardLibrary
          onClose={() => setShowLibrary(false)}
          onOpen={(id) => {
            useBoard.getState().loadBoard(id);
            setShowLibrary(false);
          }}
          onNew={newBoard}
        />
      )}
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {presenting && <PresentMode onClose={() => setPresenting(false)} />}
      {toast && <Toast message={toast.message} kind={toast.kind} />}
    </div>
  );
}
