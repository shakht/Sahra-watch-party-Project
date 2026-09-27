const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/app.js'), 'utf8');

async function harness({ name, room, blockedStorage = false } = {}) {
  let now = Date.now();
  class TestDate extends Date { static now() { return now; } }
  const data = new Map(name ? [['sahra_nick', name]] : []);
  const session = new Map();
  const storage = map => ({
    getItem(k) { if (blockedStorage) throw Error('Blocked'); return map.get(k) ?? null; },
    setItem(k, v) { if (blockedStorage) throw Error('Blocked'); map.set(k, v); },
    removeItem(k) { map.delete(k); },
  });
  let app, mounted, subscription, presence = {}, config;
  const handlers = new Map(), sent = [], tracked = [], intervals = new Map();
  let timerId = 0;
  const channel = {
    on(kind, { event }, fn) { handlers.set(`${kind}:${event}`, fn); return this; },
    subscribe(fn) { subscription = fn; return this; },
    async track(profile) { tracked.push(profile); return 'ok'; },
    async untrack() {},
    async send(message) { sent.push(message); return 'ok'; },
    presenceState() { return presence; },
  };
  const location = { href: `https://example.test/${room ? '?room=' + room : ''}`, search: room ? '?room=' + room : '' };
  let ready = 0, position = 0, paused = true;
  const mediaHandlers = new Map();
  const player = {
    on(event, fn) { mediaHandlers.set(event, fn); },
    readyState: () => ready, currentTime(value) { if (value !== undefined) position = value; return position; },
    paused: () => paused, pause() { paused = true; }, async play() { paused = false; },
    src() { ready = 0; }, muted() {}, el: () => ({ style: {} }),
  };
  const videojs = () => player;
  videojs.browser = { IS_SAFARI: false };
  let ytEvents, ytState = 5, ytTime = 0, ytRate = 1;
  const yt = {
    getPlayerState: () => ytState, getCurrentTime: () => ytTime,
    getPlaybackRate: () => ytRate, setPlaybackRate(rate) { ytRate = rate; },
    playVideo() { ytState = 1; }, pauseVideo() { ytState = 2; },
    seekTo(time) { ytTime = time; }, mute() {}, unMute() {},
    cueVideoById() { ytState = 5; ytTime = 0; },
  };
  const YT = { PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5, ENDED: 0 },
    Player: function(_id, options) { ytEvents = options.events; return yt; } };
  const context = {
    console, URL, URLSearchParams, crypto: { randomUUID }, videojs, YT, Date: TestDate,
    fetch: async () => ({ json: async () => ({}) }),
    localStorage: storage(data), sessionStorage: storage(session),
    window: { location, YT, history: { replaceState(_s, _t, url) { location.href = url; } } },
    document: { documentElement: {} }, navigator: {},
    setTimeout: () => ++timerId, clearTimeout() {},
    setInterval(fn) { const id = ++timerId; intervals.set(id, fn); return id; },
    clearInterval(id) { intervals.delete(id); },
    supabase: { createClient: () => ({ channel(_name, options) { config = options; return channel; }, async removeChannel() {} }) },
    Vue: {
      ref: value => ({ value }), computed: fn => ({ get value() { return fn(); } }), watch() {},
      onMounted(fn) { mounted = fn; }, onUnmounted() {}, nextTick: async fn => fn?.(),
      createApp(options) { return { mount() { app = options.setup(); } }; },
    },
  };
  vm.runInNewContext(source, context);
  await mounted();
  return { app, data, session, location, tracked, sent, handlers, intervals, document: context.document,
    yt, ytReady() { ytEvents.onReady(); },
    ytEvent(state, time = ytTime) { ytState = state; ytTime = time; ytEvents.onStateChange({ data: state }); },
    advance(ms) { now += ms; }, get now() { return now; },
    player, metadata() { ready = 1; mediaHandlers.get('loadedmetadata')(); },
    get config() { return config; }, status: async status => subscription(status),
    async presence(value) { presence = value; await handlers.get('presence:sync')(); },
  };
}

test('first visit saves name before choosing create/join', async () => {
  const h = await harness();
  assert.equal(h.app.modalMode.value, 'profile');
  h.app.nameInput.value = '  علي  ';
  await h.app.saveProfile();
  assert.equal(h.data.get('sahra_nick'), 'علي');
  assert.equal(h.app.modalMode.value, 'landing');
  h.app.chooseModeCreate();
  assert.equal(h.app.showModal.value, false);
  assert.equal(h.app.isHost.value, true);
});

test('saved shared-link visitor joins without another name prompt', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  assert.equal(h.app.showModal.value, false);
  assert.equal(h.app.nickname.value, 'Ali');
  assert.equal(h.app.isHost.value, false);
  assert.equal(h.config.config.presence.key, h.app.participantId);
});

test('name changes retain participant identity and update presence', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  await h.status('SUBSCRIBED');
  const id = h.app.participantId;
  h.app.editName(); h.app.nameInput.value = 'Noor';
  await h.app.saveProfile();
  assert.equal(h.app.participantId, id);
  assert.equal(h.tracked.at(-1).username, 'Noor');
  assert.equal(h.data.get('sahra_nick'), 'Noor');
  assert.equal(h.app.showModal.value, false);
});

test('cancel name editing preserves saved identity', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.editName(); h.app.nameInput.value = 'Noor'; h.app.cancelNameEdit();
  assert.equal(h.app.nickname.value, 'Ali');
  assert.equal(h.data.get('sahra_nick'), 'Ali');
  assert.equal(h.app.modalMode.value, 'landing');
});

test('blocked storage does not prevent onboarding', async () => {
  const h = await harness({ blockedStorage: true });
  h.app.nameInput.value = 'Ali'; await h.app.saveProfile();
  assert.equal(h.app.modalMode.value, 'landing');
  assert.equal(h.app.nickname.value, 'Ali');
  assert.equal(h.app.toasts.value.length, 1);
});

test('duplicate names remain distinct participants', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  await h.presence({ first: [{ username: 'Ali', isHost: false }], second: [{ username: 'Ali', isHost: false }] });
  assert.equal(h.app.onlineUsers.value.length, 2);
  assert.notEqual(h.app.onlineUsers.value[0].key, h.app.onlineUsers.value[1].key);
});

test('resubscription requests latest state and maintains one sync timer', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  await h.status('SUBSCRIBED'); await h.status('CHANNEL_ERROR'); await h.app.reconnect();
  await h.status('SUBSCRIBED');
  assert.equal(h.sent.filter(m => m.event === 'request_state').length, 2);
  assert.equal(h.intervals.size, 1);
});

test('new party records host role before navigation', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.startNewParty();
  const room = new URL(h.location.href).searchParams.get('room');
  assert.equal(h.session.get(`sahra_host_${room}`), '1');
});

test('newer host wins when disconnected host returns', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.chooseModeCreate(); await h.status('SUBSCRIBED');
  await h.presence({ [h.app.participantId]: [h.tracked.at(-1)], peer: [{ username: 'Noor', isHost: true, hostSince: Date.now() + 1000 }] });
  assert.equal(h.app.isHost.value, false);
  assert.equal(h.tracked.at(-1).isHost, false);
});

test('local blob URLs never leave the host during resync', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.chooseModeCreate();
  h.app.videoSrc.value = 'blob:https://example.test/private-file';
  h.app.broadcastCurrentState();
  assert.equal(h.sent.some(m => m.event === 'video_source'), false);
});

test('stale presence from before reload does not demote the returning host', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.chooseModeCreate(); await h.status('SUBSCRIBED');
  await h.presence({ stale: [{ username: 'Ali', isHost: true, hostSince: 1 }] });
  assert.equal(h.app.isHost.value, true);
});

test('invalid media and room inputs are rejected', async () => {
  const h = await harness({ name: 'Ali' });
  h.app.urlInput.value = 'javascript:alert(1)'; await h.app.loadVideo();
  assert.ok(h.app.mediaError.value);
  assert.equal(h.app.iframeSrc.value, '');
  h.app.joinCodeInput.value = '../invalid'; h.app.confirmJoinCode();
  assert.equal(h.location.href, 'https://example.test/');
});

test('viewer queues paused host position until media metadata is ready', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  h.app.urlInput.value = 'https://example.test/movie.mp4';
  await h.app.loadVideo();
  h.handlers.get('broadcast:playback_control')({ payload: { action: 'pause', ts: 75 } });
  assert.equal(h.player.currentTime(), 0);
  h.metadata();
  assert.equal(h.player.currentTime(), 75);
  assert.equal(h.player.paused(), true);
});

test('invalid remote playback timestamps do not reach the player', async () => {
  const h = await harness({ name: 'Ali', room: 'ABC123' });
  h.app.urlInput.value = 'https://example.test/movie.mp4';
  await h.app.loadVideo(); h.metadata();
  h.handlers.get('broadcast:playback_control')({ payload: { action: 'seek', ts: -1 } });
  assert.equal(h.player.currentTime(), 0);
});

test('changing language updates document language and reading direction', async () => {
  const h = await harness({ name: 'Ali' });
  assert.equal(h.document.documentElement.dir, 'ltr');
  h.app.toggleLang();
  assert.equal(h.document.documentElement.lang, 'ar');
  assert.equal(h.document.documentElement.dir, 'rtl');
  h.app.toggleLang();
  assert.equal(h.document.documentElement.lang, 'en');
  assert.equal(h.document.documentElement.dir, 'ltr');
});

async function youtubeHarness(host = false) {
  const h = await harness({ name: host ? 'Host' : 'Viewer', room: host ? undefined : 'ABC123' });
  if (host) h.app.chooseModeCreate();
  await h.status('SUBSCRIBED');
  h.app.urlInput.value = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
  await h.app.loadVideo(); h.ytReady();
  return h;
}

test('YouTube viewer pause is ordered by host and applied to all viewers without echo', async () => {
  const host = await youtubeHarness(true), viewer = await youtubeHarness(), other = await youtubeHarness();
  viewer.ytEvent(1, 20); viewer.ytEvent(2, 21);
  const request = viewer.sent.filter(m => m.event === 'playback_request').at(-1);
  assert.equal(request.payload.action, 'pause');
  host.handlers.get('broadcast:playback_request')({ payload: request.payload });
  const ordered = host.sent.filter(m => m.event === 'playback_control').at(-1);
  assert.equal(host.yt.getPlayerState(), 2);
  assert.equal(host.yt.getCurrentTime(), 21);
  other.handlers.get('broadcast:playback_control')({ payload: ordered.payload });
  assert.equal(other.yt.getCurrentTime(), 21);
  const before = other.sent.length;
  other.ytEvent(2);
  assert.equal(other.sent.length, before, 'API pause callback must not produce another request');
  const hostBefore = host.sent.length;
  host.ytEvent(2);
  assert.equal(host.sent.length, hostBefore, 'host must not echo its own accepted request');
});

test('YouTube transport correction handles phones with a different clock', async () => {
  const h = await youtubeHarness();
  const ping = h.sent.find(m => m.event === 'sync_ping').payload;
  h.advance(200);
  h.handlers.get('broadcast:sync_pong')({ payload: { to: h.app.participantId, echo: ping.sentAt, hostNow: ping.sentAt + 40100, hostId: 'host' } });
  h.handlers.get('broadcast:playback_control')({ payload: {
    action: 'play', ts: 20, hostId: 'host', sentAt: ping.sentAt + 40100,
    sequence: 1, media: 'youtube:M7lc1UVf-VE', rate: 1,
  } });
  assert.ok(Math.abs(h.yt.getCurrentTime() - 20.1) < 0.001);
  h.advance(1500); // Mobile buffering finishes later than command receipt.
  const requests = h.sent.filter(m => m.event === 'playback_request').length;
  h.ytEvent(1);
  assert.ok(Math.abs(h.yt.getCurrentTime() - 21.6) < 0.001);
  assert.equal(h.sent.filter(m => m.event === 'playback_request').length, requests);
  h.advance(12000); // Long buffering must not rewind the host by becoming a new user command.
  h.ytEvent(1);
  assert.ok(Math.abs(h.yt.getCurrentTime() - 33.6) < 0.001);
  assert.equal(h.sent.filter(m => m.event === 'playback_request').length, requests);
});

test('a late older YouTube play cannot undo the newest pause', async () => {
  const h = await youtubeHarness();
  const base = { hostId: 'host', media: 'youtube:M7lc1UVf-VE', ts: 10 };
  h.handlers.get('broadcast:playback_control')({ payload: { ...base, action: 'pause', sequence: 2 } });
  h.ytEvent(2);
  h.handlers.get('broadcast:playback_control')({ payload: { ...base, action: 'play', sequence: 1 } });
  assert.equal(h.yt.getPlayerState(), 2);
  h.ytEvent(1); // A real user immediately presses play after the remote pause.
  assert.equal(h.sent.filter(m => m.event === 'playback_request').at(-1).payload.action, 'play');
});

test('YouTube buffering does not broadcast a room pause', async () => {
  const h = await youtubeHarness(true);
  h.ytEvent(1, 12);
  const before = h.sent.filter(m => m.event === 'playback_control').length;
  h.ytEvent(3);
  h.app.broadcastCurrentState();
  assert.equal(h.sent.filter(m => m.event === 'playback_control').length, before);
});

test('late-ready YouTube player applies the queued room state', async () => {
  const h = await harness({ name: 'Viewer', room: 'ABC123' });
  await h.status('SUBSCRIBED');
  h.app.urlInput.value = 'https://www.youtube.com/watch?v=M7lc1UVf-VE';
  await h.app.loadVideo();
  h.handlers.get('broadcast:playback_control')({ payload: { action: 'pause', ts: 42 } });
  assert.equal(h.yt.getCurrentTime(), 0);
  h.ytReady();
  assert.equal(h.yt.getCurrentTime(), 42);
  assert.equal(h.yt.getPlayerState(), 2);
});
