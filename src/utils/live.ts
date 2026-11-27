import { useEffect, useState } from 'react';
import type { Point, ToolType } from '../types';

/* ------------------------------------------------------------------ *
 * Experimental live presence.
 *
 * There is no server: peers talk over BroadcastChannel, which reaches every
 * tab, window and same-origin frame in this browser instantly (and over
 * WebRTC-style local channels where the browser supports it). The board
 * content itself travels inside the invite link, so a guest opens the same
 * board in their own tab and both sides can see each other's cursors.
 * ------------------------------------------------------------------ */

export type PeerRect = { x: number; y: number; width: number; height: number };

export interface Peer {
  id: string;
  name: string;
  color: string;
  /** cursor position in scene coordinates (null when the pointer left) */
  cursor: Point | null;
  tool: ToolType;
  selection: PeerRect[];
  /** in-progress freedraw stroke, scene-relative to its own origin */
  ink: { origin: Point; points: Point[] } | null;
  lastSeen: number;
  boardName?: string;
}

interface WireState {
  type: 'state' | 'hello' | 'bye';
  id: string;
  name: string;
  color: string;
  cursor: Point | null;
  tool: ToolType;
  selection: PeerRect[];
  ink: { origin: Point; points: Point[] } | null;
  boardName?: string;
  at: number;
}

const PEER_TIMEOUT = 7000;
const HEARTBEAT = 2000;
const CURSOR_THROTTLE = 55;

export const PEER_COLORS = [
  '#ff5c9d',
  '#22b8cf',
  '#f59f00',
  '#7048e8',
  '#37b24d',
  '#f06595',
  '#0ca678',
  '#e8590c',
];

const colorFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return PEER_COLORS[h % PEER_COLORS.length];
};

const randomId = () => Math.random().toString(36).slice(2, 10);
const randomName = () => `Guest ${100 + Math.floor(Math.random() * 899)}`;

const PREFS = 'collabboard:v2:live';

interface LivePrefs {
  enabled?: boolean;
  name?: string;
}

function loadPrefs(): LivePrefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as LivePrefs;
  } catch {
    return {};
  }
}

function savePrefs(p: LivePrefs) {
  try {
    localStorage.setItem(PREFS, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Session singleton
 * ------------------------------------------------------------------ */
class LiveSession {
  private channel: BroadcastChannel | null = null;
  private room: string | null = null;
  private listeners = new Set<() => void>();
  private peers = new Map<string, Peer>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private pruneTimer: ReturnType<typeof setInterval> | null = null;
  private lastCursorSend = 0;
  private lastSentCursor: Point | null = null;
  private drawing = false;

  me = {
    id: randomId(),
    name: loadPrefs().name ?? randomName(),
    color: '#000',
  };

  enabled = false;
  /** true when the browser supports same-origin channels */
  supported = typeof BroadcastChannel !== 'undefined';

  constructor() {
    this.me.color = colorFor(this.me.id);
  }

  subscribe = (cb: () => void) => {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  };

  private emit() {
    for (const cb of this.listeners) cb();
  }

  peersList(): Peer[] {
    return [...this.peers.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  currentRoom() {
    return this.room;
  }

  setSelf(patch: { name?: string }) {
    if (patch.name && patch.name.trim()) {
      this.me.name = patch.name.trim().slice(0, 24);
      savePrefs({ ...loadPrefs(), name: this.me.name });
      this.send(true);
      this.emit();
    }
  }

  start(room: string) {
    if (!this.supported) return false;
    this.stop();
    this.room = room;
    this.enabled = true;
    this.peers.clear();
    savePrefs({ ...loadPrefs(), enabled: true });
    try {
      this.channel = new BroadcastChannel(`collabboard:live:${room}`);
    } catch {
      this.enabled = false;
      return false;
    }
    this.channel.onmessage = (ev: MessageEvent<WireState>) => this.receive(ev.data);
    this.channel.postMessage(this.snapshot('hello'));
    this.heartbeat = setInterval(() => this.send(true), HEARTBEAT);
    this.pruneTimer = setInterval(() => this.prune(), 1500);
    this.emit();
    return true;
  }

  stop(silent = false) {
    if (this.channel) {
      try {
        this.channel.postMessage(this.snapshot('bye'));
      } catch {
        /* ignore */
      }
      this.channel.onmessage = null;
      this.channel.close();
    }
    this.channel = null;
    if (this.heartbeat) clearInterval(this.heartbeat);
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    this.heartbeat = null;
    this.pruneTimer = null;
    this.peers.clear();
    this.room = null;
    this.enabled = false;
    if (!silent) savePrefs({ ...loadPrefs(), enabled: false });
    this.emit();
  }

  private snapshot(type: WireState['type'], extra: Partial<WireState> = {}): WireState {
    const base = this.state;
    return {
      type,
      id: this.me.id,
      name: this.me.name,
      color: this.me.color,
      cursor: base.cursor,
      tool: base.tool,
      selection: base.selection,
      ink: base.ink,
      at: Date.now(),
      ...extra,
    };
  }

  private state: {
    cursor: Point | null;
    tool: ToolType;
    selection: PeerRect[];
    ink: { origin: Point; points: Point[] } | null;
  } = { cursor: null, tool: 'select', selection: [], ink: null };

  private send(force = false) {
    if (!this.channel || !this.enabled) return;
    const now = Date.now();
    const budget = this.drawing ? CURSOR_THROTTLE / 2 : CURSOR_THROTTLE;
    if (!force && now - this.lastCursorSend < budget) return;
    this.lastCursorSend = now;
    try {
      this.channel.postMessage(this.snapshot('state'));
    } catch {
      /* channel closed */
    }
  }

  private receive(msg: WireState) {
    if (!msg || msg.id === this.me.id) return;
    // ignore absurd timestamps so one bad clock can't spam or hide a peer
    if (typeof msg.at === 'number' && msg.at - Date.now() > PEER_TIMEOUT) return;
    if (msg.type === 'bye') {
      if (this.peers.delete(msg.id)) this.emit();
      return;
    }
    const existing = this.peers.get(msg.id);
    this.peers.set(msg.id, {
      id: msg.id,
      name: msg.name || 'Guest',
      color: msg.color || colorFor(msg.id),
      cursor: msg.cursor ?? null,
      tool: msg.tool ?? 'select',
      selection: Array.isArray(msg.selection) ? msg.selection.slice(0, 40) : [],
      ink: msg.ink ?? null,
      lastSeen: Date.now(),
      boardName: msg.boardName ?? existing?.boardName,
    });
    // answer hellos immediately so late joiners see us without waiting a beat
    if (msg.type === 'hello') this.send(true);
    this.emit();
  }

  private prune() {
    const cutoff = Date.now() - PEER_TIMEOUT;
    let changed = false;
    for (const [id, peer] of this.peers) {
      if (peer.lastSeen < cutoff) {
        this.peers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  setCursor(p: Point | null) {
    if (!this.enabled) return;
    if (!p) {
      if (!this.state.cursor) return;
      this.state.cursor = null;
      this.send(true);
      return;
    }
    const prev = this.lastSentCursor;
    if (prev && Math.hypot(prev[0] - p[0], prev[1] - p[1]) < 1.5) return;
    this.lastSentCursor = p;
    this.state.cursor = [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
    this.send();
  }

  setTool(tool: ToolType) {
    if (!this.enabled || this.state.tool === tool) return;
    this.state.tool = tool;
    this.send(true);
  }

  setSelection(rects: PeerRect[]) {
    if (!this.enabled) return;
    const key = rects.map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`).join('|');
    const prevKey = this.state.selection
      .map((r) => `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.width)},${Math.round(r.height)}`)
      .join('|');
    if (key === prevKey) return;
    this.state.selection = rects.slice(0, 40);
    this.send(true);
  }

  setInk(ink: { origin: Point; points: Point[] } | null) {
    if (!this.enabled) return;
    const prev = this.state.ink;
    if (!ink && !prev) return;
    if (ink && prev && ink.points.length === prev.points.length && ink.origin[0] === prev.origin[0]) return;
    this.drawing = !!ink;
    this.state.ink = ink ? { origin: ink.origin, points: ink.points.slice(-160) } : null;
    this.send(true);
  }
}

export const live = new LiveSession();

/* ------------------------------------------------------------------ *
 * React bindings
 * ------------------------------------------------------------------ */
export function useLive() {
  const [version, setVersion] = useState(0);
  useEffect(() => live.subscribe(() => setVersion((v) => v + 1)), []);
  void version;
  return {
    enabled: live.enabled,
    supported: live.supported,
    room: live.currentRoom(),
    me: live.me,
    peers: live.peersList(),
  };
}

export function useLiveRoomFromHash(): string | null {
  const [room, setRoom] = useState<string | null>(() => readRoomFromHash());
  useEffect(() => {
    const onHash = () => setRoom(readRoomFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return room;
}

export function readRoomFromHash(hash = window.location.hash): string | null {
  const m = hash.match(/[?&]room=([\w-]+)/);
  return m ? m[1] : null;
}

export function makeRoomCode() {
  const words = ['wave', 'forest', 'ember', 'lotus', 'north', 'pixel', 'comet', 'harbor'];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.random().toString(36).slice(2, 6)}`;
}
