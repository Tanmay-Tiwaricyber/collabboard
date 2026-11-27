import { useEffect, useRef } from 'react';
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignStartVertical,
  BringToFront,
  ClipboardPaste,
  Copy,
  Lock,
  LockOpen,
  SendToBack,
  SquareDashed,
  Trash2,
  Type,
  Ungroup as UngroupIcon,
  Group as GroupIcon,
  CopyPlus,
} from 'lucide-react';
import { useBoard, createElement } from '../store/board';

export interface MenuState {
  x: number;
  y: number;
  scene: [number, number];
}

export default function ContextMenu({ state, onClose }: { state: MenuState; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const app = useBoard((s) => s.app);
  const elements = useBoard((s) => s.elements);
  const hasSelection = app.selection.length > 0;
  const multi = app.selection.length > 1;
  const anyLocked = elements.some((e) => app.selection.includes(e.id) && e.locked);
  const hasGroup = elements.some((e) => app.selection.includes(e.id) && e.groupId);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown, true);
    return () => window.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const item = (
    label: string,
    icon: React.ReactNode,
    action: () => void,
    disabled = false,
    shortcut?: string,
  ) => (
    <button
      key={label}
      className="menu-item"
      disabled={disabled}
      onClick={() => {
        action();
        onClose();
      }}
    >
      <span className="menu-icon">{icon}</span>
      <span className="menu-label">{label}</span>
      {shortcut && <span className="menu-shortcut">{shortcut}</span>}
    </button>
  );

  const st = useBoard.getState();

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{
        left: Math.min(state.x, window.innerWidth - 260),
        top: Math.min(state.y, window.innerHeight - 470),
      }}
    >
      {item('Copy', <Copy size={15} />, () => st.copySelection(), !hasSelection, '⌘C')}
      {item('Paste', <ClipboardPaste size={15} />, () => st.paste(), false, '⌘V')}
      {item('Duplicate', <CopyPlus size={15} />, () => st.duplicateSelection(), !hasSelection, '⌘D')}
      {item('Delete', <Trash2 size={15} />, () => st.deleteSelection(), !hasSelection, '⌫')}
      <div className="menu-sep" />
      {item('Bring to front', <BringToFront size={15} />, () => st.bringToFront(app.selection), !hasSelection)}
      {item('Send to back', <SendToBack size={15} />, () => st.sendToBack(app.selection), !hasSelection)}
      <div className="menu-sep" />
      {multi && item('Align left', <AlignStartVertical size={15} />, () => st.alignSelection('left'))}
      {multi && item('Align centers', <AlignCenterVertical size={15} />, () => st.alignSelection('center'))}
      {multi && item('Align right', <AlignEndVertical size={15} />, () => st.alignSelection('right'))}
      {multi && item('Align top', <AlignStartHorizontal size={15} />, () => st.alignSelection('top'))}
      {multi && item('Align middles', <AlignCenterHorizontal size={15} />, () => st.alignSelection('middle'))}
      {multi && item('Align bottom', <AlignEndHorizontal size={15} />, () => st.alignSelection('bottom'))}
      {multi && <div className="menu-sep" />}
      {multi && item('Group', <GroupIcon size={15} />, () => st.groupSelection())}
      {hasGroup && item('Ungroup', <UngroupIcon size={15} />, () => st.ungroupSelection())}
      {item(anyLocked ? 'Unlock' : 'Lock', anyLocked ? <LockOpen size={15} /> : <Lock size={15} />, () => st.toggleLock(), !hasSelection)}
      <div className="menu-sep" />
      {item(
        'Add text',
        <Type size={15} />,
        () => {
          const s = useBoard.getState();
          const el = createElement({
            type: 'text',
            x: state.scene[0],
            y: state.scene[1],
            width: 320,
            height: 34,
            app: s.app,
            text: '',
          });
          s.pushHistory('text');
          useBoard.setState({ elements: [...s.elements, el], app: { ...s.app, selection: [el.id], tool: 'select' } });
        },
      )}
      {item(
        'Select all',
        <SquareDashed size={15} />,
        () => st.setApp({ selection: elements.filter((e) => !e.locked).map((e) => e.id) }),
        false,
        '⌘A',
      )}
    </div>
  );
}
