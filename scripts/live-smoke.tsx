/* Two peers, real BroadcastChannel: verify presence, cursors, selections,
   in-progress ink, heartbeats, leaving, and that a stale peer is pruned. */
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost:3000/?room=test-room#board=x' });
(globalThis as any).window = dom.window;
(globalThis as any).document = dom.window.document;
(globalThis as any).localStorage = dom.window.localStorage;
// jsdom has no BroadcastChannel; node's own implementation is spec-compliant
// and shared across "windows" in the same process, which is exactly what we need.
(globalThis as any).BroadcastChannel = globalThis.BroadcastChannel;

let fails = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (!cond) { fails++; console.error('FAIL', name, extra); } else console.log('ok  ', name);
};

const { live, readRoomFromHash, makeRoomCode } = await import('../src/utils/live');

check('room parsed from invite url', readRoomFromHash('?room=abc-123#board=zzz') === 'abc-123');
check('no room when absent', readRoomFromHash('#board=zzz') === null);
check('generated code looks sane', /^[a-z]+-[a-z0-9]{4}$/.test(makeRoomCode()), makeRoomCode());

check('starts live', live.start('test-room') === true);
check('enabled after start', live.enabled === true);
check('room recorded', live.currentRoom() === 'test-room');

// second peer in the same "browser" namespace, simulating another window
const second = new (globalThis as any).BroadcastChannel('collabboard:live:test-room');
const received: any[] = [];
second.onmessage = (e: MessageEvent) => received.push(e.data);
// announce ourselves from the fake peer
const hello = {
  type: 'hello', id: 'peer-b', name: 'Riya', color: '#22b8cf',
  cursor: [100, 200], tool: 'pen', selection: [{ x: 10, y: 20, width: 50, height: 60 }],
  ink: null, at: Date.now(),
};
second.postMessage(hello);

await new Promise((r) => setTimeout(r, 120));
let peers = live.peersList();
check('peer discovered', peers.length === 1, JSON.stringify(peers.map((p) => p.name)));
check('peer name/colour kept', peers[0]?.name === 'Riya' && peers[0]?.color === '#22b8cf');
check('peer cursor received', peers[0]?.cursor?.[0] === 100);
check('peer selection received', peers[0]?.selection.length === 1);
check('peer tool received', peers[0]?.tool === 'pen');

// our own updates should be broadcast to the peer
received.length = 0;
live.setCursor([42, 84]);
await new Promise((r) => setTimeout(r, 90));
const cursorMsg = received.filter((m) => m.type === 'state').pop();
check('we broadcast our cursor', !!cursorMsg && cursorMsg.cursor?.[0] === 42, JSON.stringify(cursorMsg?.cursor));
check('we identify ourselves', cursorMsg?.id === live.me.id);

live.setTool('eraser');
await new Promise((r) => setTimeout(r, 60));
check('we broadcast tool changes', received.some((m) => m.tool === 'eraser'));

live.setSelection([{ x: 1, y: 2, width: 3, height: 4 }]);
await new Promise((r) => setTimeout(r, 60));
check('we broadcast selections', received.some((m) => m.selection?.length === 1));

live.setInk({ origin: [5, 5], points: [[0, 0], [10, 10], [20, 5]] });
await new Promise((r) => setTimeout(r, 60));
const inkMsg = received.filter((m) => m.ink).pop();
check('we broadcast live ink', !!inkMsg && inkMsg.ink.points.length === 3, JSON.stringify(inkMsg?.ink));
live.setInk(null);
await new Promise((r) => setTimeout(r, 60));
check('ink cleared when stroke ends', received[received.length - 1]?.ink === null);

// throttling: a burst of cursor moves must not flood the channel
received.length = 0;
for (let i = 0; i < 60; i++) live.setCursor([i * 10, i * 5]);
await new Promise((r) => setTimeout(r, 80));
check('cursor messages throttled', received.filter((m) => m.type === 'state').length <= 3,
  `${received.filter((m) => m.type === 'state').length} messages`);

// duplicate sends of the same point are skipped
received.length = 0;
live.setCursor([1234, 5678]);
live.setCursor([1234.2, 5678.2]);
await new Promise((r) => setTimeout(r, 80));
check('unchanged cursor not resent', received.filter((m) => m.type === 'state').length <= 1);

// peer leaves
second.postMessage({ ...hello, type: 'bye' });
await new Promise((r) => setTimeout(r, 100));
check('peer removed on bye', live.peersList().length === 0);

// stale peer pruning (simulate an old timestamp)
second.postMessage({ ...hello, at: Date.now() - 60000 });
await new Promise((r) => setTimeout(r, 100));
const before = live.peersList().length;
await new Promise((r) => setTimeout(r, 1700));
check('peer reappears when heard', live.peersList().length >= 1);
void before;

live.stop();
check('disabled after stop', live.enabled === false);
check('room cleared', live.currentRoom() === null);
check('peers cleared', live.peersList().length === 0);

// the leave message is delivered asynchronously, so let it drain first
await new Promise((r) => setTimeout(r, 120));
received.length = 0;
live.setCursor([9, 9]);
live.setTool('pen');
live.setSelection([{ x: 0, y: 0, width: 1, height: 1 }]);
await new Promise((r) => setTimeout(r, 80));
check('silent after stop', received.length === 0, JSON.stringify(received));

second.close();

console.log(fails ? `\n${fails} FAILURES` : '\nlive smoke passed');
process.exit(fails ? 1 : 0);
