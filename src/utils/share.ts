import LZString from 'lz-string';
import type { BoardDocument, BoardElement } from '../types';
import { nanoid } from '../utils/geometry';

export interface SharePayload {
  v: 1;
  n: string;
  e: BoardElement[];
  t: 'dark' | 'light';
  p?: string;
}

const KEY = '#board=';

/** Compact a document into a URL-safe share string. */
export function encodeShare(doc: { name: string; elements: BoardElement[]; theme: 'dark' | 'light'; pattern: string }): string {
  const payload: SharePayload = {
    v: 1,
    n: doc.name,
    e: doc.elements,
    t: doc.theme,
    p: doc.pattern,
  };
  // strip transient/derived values to keep links short
  const slim = {
    ...payload,
    e: payload.e.map((el) => {
      const copy: Record<string, unknown> = { ...el };
      delete copy.version;
      if (copy.type === 'freedraw') {
        copy.points = (copy.points as number[][]).map((p) => [r(p[0]), r(p[1])]);
      }
      if (copy.type === 'arrow' || copy.type === 'line') {
        copy.points = (copy.points as number[][]).map((p) => [r(p[0]), r(p[1])]);
      }
      copy.x = r(copy.x as number);
      copy.y = r(copy.y as number);
      copy.width = r(copy.width as number);
      copy.height = r(copy.height as number);
      return copy as unknown as BoardElement;
    }),
  };
  return LZString.compressToEncodedURIComponent(JSON.stringify(slim));
}

const r = (n: number) => Math.round(n * 10) / 10;

export function decodeShare(hash: string): (SharePayload & { appPattern?: string }) | null {
  try {
    const idx = hash.indexOf(KEY);
    if (idx === -1) return null;
    let raw = hash.slice(idx + KEY.length);
    if (!raw) return null;
    const decoded = LZString.decompressFromEncodedURIComponent(raw);
    if (!decoded) {
      // fallback to base64 JSON
      try {
        raw = decodeURIComponent(raw);
        const json = atob(raw);
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
    const parsed = JSON.parse(decoded);
    if (!parsed || !Array.isArray(parsed.e)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function buildShareUrl(doc: { name: string; elements: BoardElement[]; theme: 'dark' | 'light'; pattern: string }): string {
  const encoded = encodeShare(doc);
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}${KEY}${encoded}`;
}

export function shareUrlForBoardId(id: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#local=${id}`;
}

export function parseRoute(): { kind: 'share'; payload: SharePayload } | { kind: 'local'; id: string } | { kind: 'new' } {
  const hash = window.location.hash;
  if (hash.includes(KEY)) {
    const payload = decodeShare(hash);
    if (payload) return { kind: 'share', payload };
  }
  const local = hash.match(/#local=([\w-]+)/);
  if (local) return { kind: 'local', id: local[1] };
  return { kind: 'new' };
}

export function clearRoute() {
  history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

export function shareSlug(name: string) {
  return (name || 'board').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'board';
}

export function newShareId() {
  return nanoid(12);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function urlLengthWarning(url: string) {
  if (url.length > 60000) return 'This board is very large — the link may not open in some browsers. Try Export → JSON instead.';
  if (url.length > 16000) return 'Large board: this link is long and may be truncated when pasted into some apps.';
  return null;
}

export function documentFromShare(payload: SharePayload): BoardDocument {
  return {
    id: nanoid(10),
    name: payload.n || 'Shared board',
    elements: payload.e,
    appState: {
      strokeColor: '#1e1e28',
      backgroundColor: 'transparent',
      fillStyle: 'hachure',
      strokeWidth: 2,
      strokeStyle: 'solid',
      theme: payload.t ?? 'light',
      backgroundPattern: (payload.p as BoardDocument['appState']['backgroundPattern']) ?? 'dots',
      fontSize: 24,
      fontFamily: 'hand',
      roughness: 1,
      opacity: 1,
    },
    version: 1,
    updatedAt: Date.now(),
  };
}
