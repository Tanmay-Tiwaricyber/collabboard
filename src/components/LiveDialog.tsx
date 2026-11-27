import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Radio,
  RefreshCw,
  Users,
  X,
  FlaskConical,
  ExternalLink,
} from 'lucide-react';
import { useBoard } from '../store/board';
import { buildShareUrl, copyText } from '../utils/share';
import { live, makeRoomCode, useLive } from '../utils/live';

interface Props {
  onClose: () => void;
  notify: (msg: string, kind?: 'info' | 'error' | 'success') => void;
}

export default function LiveDialog({ onClose, notify }: Props) {
  const app = useBoard((s) => s.app);
  const elements = useBoard((s) => s.elements);
  const boardName = useBoard((s) => s.boardName);
  const { enabled, supported, room, me, peers } = useLive();
  const [copied, setCopied] = useState<string | null>(null);
  const [name, setName] = useState(me.name);

  // start a room automatically when the dialog opens, so there is something to share
  useEffect(() => {
    if (!enabled && supported) live.start(makeRoomCode());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  const activeRoom = room ?? live.currentRoom() ?? '';

  const inviteUrl = useMemo(() => {
    if (!activeRoom) return '';
    const base = buildShareUrl({
      name: boardName,
      elements,
      theme: app.theme,
      pattern: app.backgroundPattern,
    });
    const sep = base.includes('?') ? '&' : '?';
    // hash already starts with #board=…, so append the room as a query param in
    // front of the hash for maximum compatibility with paste targets
    const [head, hash] = base.split('#');
    return `${head}${sep}room=${activeRoom}#${hash}`;
  }, [activeRoom, boardName, elements, app.theme, app.backgroundPattern]);

  const copy = async (text: string, key: string) => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } else notify('Could not access the clipboard', 'error');
  };

  const stop = () => {
    live.stop();
    notify('Live cursors turned off');
  };

  const restart = () => {
    live.start(makeRoomCode());
    notify('New room started — share the fresh link', 'success');
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal live-modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <div>
            <h2>
              <Radio size={18} /> Live cursors
              <span className="experimental-badge">
                <FlaskConical size={10} /> experimental
              </span>
            </h2>
            <p className="muted">
              See other people's cursors, selections and strokes while they draw — no account, no server.
            </p>
          </div>
          <button className="ghost-btn icon-only" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {!supported && (
          <p className="hint warn">
            This browser doesn't support the local channel API used for live presence. Try Chrome, Edge, Firefox or
            Safari 15.4+.
          </p>
        )}

        {supported && (
          <>
            <div className="option-row" style={{ marginBottom: 10 }}>
              <span>
                Room code
                <span className="muted tiny"> · everyone opening the same code sees each other</span>
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="ghost-btn" onClick={restart} title="Start a fresh room">
                  <RefreshCw size={14} /> New
                </button>
                {enabled ? (
                  <button className="ghost-btn" onClick={stop} title="Stop sharing presence">
                    <LogOut size={14} /> Leave
                  </button>
                ) : (
                  <button className="primary-btn" onClick={() => live.start(makeRoomCode())}>
                    <Radio size={14} /> Go live
                  </button>
                )}
              </div>
            </div>

            <div className="room-code">
              <code>{activeRoom || 'not connected'}</code>
              <button
                className="secondary-btn"
                onClick={() => copy(activeRoom, 'room')}
                disabled={!activeRoom}
                title="Copy the room code"
              >
                {copied === 'room' ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>

            <div className="share-link-row">
              <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} />
              <button className="primary-btn" onClick={() => copy(inviteUrl, 'link')} disabled={!inviteUrl}>
                {copied === 'link' ? <Check size={15} /> : <Copy size={15} />}
                {copied === 'link' ? 'Copied' : 'Copy invite'}
              </button>
            </div>
            <p className="hint">
              The invite carries the board itself plus the room code: whoever opens it lands on this board and shows up
              here. Presence travels straight between browsers over a local channel — nothing is uploaded. Open the
              link in a second window to try it.
            </p>

            <div className="option-row" style={{ marginTop: 14 }}>
              <span>
                <Users size={14} /> Your display name
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  className="name-input"
                  style={{ width: 160 }}
                  value={name}
                  maxLength={24}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => live.setSelf({ name })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') live.setSelf({ name });
                  }}
                />
                <button
                  className="ghost-btn"
                  onClick={() => buildShareUrl({ name: boardName, elements, theme: app.theme, pattern: app.backgroundPattern }) && window.open(inviteUrl, '_blank')}
                  title="Open the invite in a new window (great for testing)"
                >
                  <ExternalLink size={14} /> Test
                </button>
              </div>
            </div>

            <div className="peer-list">
              <div className="peer-row">
                <span className="swatch-dot" style={{ background: me.color }} />
                <strong>{me.name}</strong>
                <span className="muted-pill">you · {enabled ? 'live' : 'offline'}</span>
              </div>
              {peers.map((p) => (
                <div key={p.id} className="peer-row">
                  <span className="swatch-dot" style={{ background: p.color }} />
                  {p.name}
                  <span className="muted-pill">{p.tool}</span>
                </div>
              ))}
              {!peers.length && (
                <p className="muted tiny" style={{ margin: '4px 2px' }}>
                  Nobody else here yet. Copy the invite and open it in another window.
                </p>
              )}
            </div>
          </>
        )}

        <div className="modal-actions">
          <span className="muted tiny">
            Experimental: presence is browser-local (same device / same browser channels), designed to be swapped for
            a WebRTC or WebSocket transport later.
          </span>
          <span className="spacer" />
          <button className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
