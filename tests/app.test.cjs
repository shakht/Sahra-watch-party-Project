const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../assets/app.js'), 'utf8');

async function harness({ name, room, blockedStorage = false } = {}) {
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
  const context = {
    console, URL, URLSearchParams, crypto: { randomUUID }, videojs,
    localStorage: storage(data), sessionStorage: storage(session),
    window: { location, history: { replaceState(_s, _t, url) { location.href = url; } } },
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
