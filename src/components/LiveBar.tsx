import { Radio, Users } from 'lucide-react';
import { useLive } from '../utils/live';

/** Compact presence pill: who is on the board right now (experimental). */
export default function LiveBar({ onOpen }: { onOpen: () => void }) {
  const { enabled, peers, me } = useLive();
  if (!enabled) return null;

  const people = [{ id: me.id, name: me.name, color: me.color }, ...peers];

  return (
    <div className="live-bar" role="status" aria-live="polite">
      <span className="dot-live" />
      <Radio size={13} />
      <span>{peers.length ? `${peers.length + 1} live` : 'Live'}</span>
      <div className="live-avatars">
        {people.slice(0, 4).map((p) => (
          <span key={p.id} className="live-avatar" style={{ background: p.color }} title={p.name}>
            {p.name.replace(/[^a-zA-Z]/g, '').slice(0, 1) || '?'}
          </span>
        ))}
        {people.length > 4 && <span className="live-avatar" style={{ background: '#868e96' }}>+{people.length - 4}</span>}
      </div>
      <button onClick={onOpen} title="Live cursor settings">
        <Users size={12} /> Manage
      </button>
    </div>
  );
}
