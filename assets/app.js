/* ═══════════════════════════════════════════════════════════════════
   سَهرة (SAHRA) — Realtime Movie Watch Party
   ───────────────────────────────────────────────────────────────────
   Stack  : Vue 3 Composition API (CDN) + Supabase JS v2 (CDN)
   Hosting: GitHub Pages, Netlify, Vercel — any static host
   Sync   : Supabase Realtime Broadcast (playback) + Presence (users)

   ▸ QUICK START
     1. Create a free Supabase project at https://app.supabase.com
     2. Enable the "Realtime" extension for your project
     3. Replace SUPABASE_URL and SUPABASE_ANON_KEY below
     4. Drop index.html in your GitHub repo → enable Pages → done ✓

   ▸ HOW IT WORKS
     · The first visitor becomes Host. Their play/pause/seek events are
       broadcast to all peers in the same room (?room=XXXXXX).
     · Peers only seek locally if their timeline drifts > 2 seconds,
       preventing infinite sync feedback loops.
     · Chat, emoji reactions, and participant presence flow through the
       same Supabase channel using event-scoped broadcasts.
═══════════════════════════════════════════════════════════════════ */

// ── ─────────────────────────────────────────────────────────────────
//  ▶  REPLACE THESE TWO VALUES WITH YOUR SUPABASE PROJECT CREDENTIALS
// ── ─────────────────────────────────────────────────────────────────
const SUPABASE_URL      = 'https://wmbxqwciyynyzqirgive.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndtYnhxd2NpeXlueXpxaXJnaXZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2MDM4MTAsImV4cCI6MjA5NTE3OTgxMH0.2d1X_joBt8jyOlnSvqmlYJ5Dd0w5ZB_0AP6BQcJHYVQ';

// ── ─────────────────────────────────────────────────────────────────
//  CONSTANTS
// ── ─────────────────────────────────────────────────────────────────
const DRIFT_THRESHOLD   = 2;    // seconds before we force-seek a peer
const SEEK_DEBOUNCE_MS  = 450;  // ms to wait before broadcasting seek
const QUICK_EMOJIS      = ['🔥', '😂', '❤️', '👏', '😱'];

const TV_CHANNELS = [
  {
    name: 'MBC 1', icon: '⭐', cat: 'General',
    servers: [
      'https://shls-mbc1-prod-dub.akamaized.net/out/u/mbc1.m3u8',
      'https://shls-mbc1-prod-fra.akamaized.net/out/u/mbc1.m3u8',
      'https://cdn-live.mbc.net/mbc1/playlist.m3u8',
      'https://www.youtube.com/@MBC1/live',
    ],
  },
  {
    name: 'MBC 2', icon: '🎬', cat: 'Movies',
    servers: [
      'https://shls-mbc2-prod-dub.akamaized.net/out/u/mbc2.m3u8',
      'https://shls-mbc2-prod-fra.akamaized.net/out/u/mbc2.m3u8',
      'https://cdn-live.mbc.net/mbc2/playlist.m3u8',
      'https://www.youtube.com/@MBC2Hollywood/live',
    ],
  },
  {
    name: 'MBC Action', icon: '💥', cat: 'Action',
    servers: [
      'https://shls-mbc-action-prod-dub.akamaized.net/out/u/mbc-action.m3u8',
      'https://shls-mbc-action-prod-fra.akamaized.net/out/u/mbc-action.m3u8',
      'https://cdn-live.mbc.net/mbcaction/playlist.m3u8',
      'https://www.youtube.com/@MBCAction/live',
    ],
  },
  {
    name: 'MBC Drama', icon: '🎭', cat: 'Drama',
    servers: [
      'https://shls-mbc-drama-prod-dub.akamaized.net/out/u/mbc-drama.m3u8',
      'https://shls-mbc-drama-prod-fra.akamaized.net/out/u/mbc-drama.m3u8',
      'https://cdn-live.mbc.net/mbcdrama/playlist.m3u8',
      'https://www.youtube.com/@MBCDrama/live',
    ],
  },
  {
    name: 'MBC 4', icon: '📺', cat: 'Series',
    servers: [
      'https://shls-mbc4-prod-dub.akamaized.net/out/u/mbc4.m3u8',
      'https://shls-mbc4-prod-fra.akamaized.net/out/u/mbc4.m3u8',
      'https://cdn-live.mbc.net/mbc4/playlist.m3u8',
      'https://www.youtube.com/@MBC4Arabia/live',
    ],
  },
  {
    name: 'MBC Masr', icon: '🇪🇬', cat: 'Egypt',
    servers: [
      'https://shls-mbc-masr-prod-dub.akamaized.net/out/u/mbc-masr.m3u8',
      'https://shls-mbc-masr-prod-fra.akamaized.net/out/u/mbc-masr.m3u8',
      'https://cdn-live.mbc.net/mbcmasr/playlist.m3u8',
      'https://www.youtube.com/@MBCMasr/live',
    ],
  },
  {
    name: 'MBC Masr 2', icon: '🌙', cat: 'Egypt',
    servers: [
      'https://shls-mbc-masr2-prod-dub.akamaized.net/out/u/mbc-masr2.m3u8',
      'https://shls-mbc-masr2-prod-fra.akamaized.net/out/u/mbc-masr2.m3u8',
      'https://cdn-live.mbc.net/mbcmasr2/playlist.m3u8',
      'https://www.youtube.com/@MBCMasr2/live',
    ],
  },
  {
    name: 'FOX Movies', icon: '🦊', cat: 'Movies',
    servers: [
      'https://foxmoviesme.akamaized.net/hls/live/foxmovies/index.m3u8',
      'https://edge01.foxmoviesme.com/live/foxmovies/index.m3u8',
      'https://cdn-live.foxmoviesme.com/foxmovies/playlist.m3u8',
      'https://www.youtube.com/@FOXMoviesArabia/live',
    ],
  },
  {
    name: 'Rotana Cinema', icon: '🎞️', cat: 'Cinema',
    servers: [
      'https://rotana.akamaized.net/hls/live/rotanacinema/index.m3u8',
      'https://edge01.rotana.net/live/rotanacinema/index.m3u8',
      'https://cdn-live.rotana.net/rotanacinema/playlist.m3u8',
      'https://www.youtube.com/@RotanaCinema/live',
    ],
  },
  {
    name: 'Rotana Khalijia', icon: '🌟', cat: 'Music',
    servers: [
      'https://rotana.akamaized.net/hls/live/rotanakhalijia/index.m3u8',
      'https://edge01.rotana.net/live/rotanakhalijia/index.m3u8',
      'https://cdn-live.rotana.net/rotanakhalijia/playlist.m3u8',
      'https://www.youtube.com/@RotanaKhalijia/live',
    ],
  },
  {
    name: 'Al Jazeera', icon: '📡', cat: 'News',
    servers: [
      'https://live-hls-web-aja.getaj.net/AJA/index.m3u8',
      'https://live-hls-web-aja-fast.getaj.net/AJA/index.m3u8',
      'https://aljazeera-eng-hd-live.samsung.fastly.net/hls/live/aljazeeraeng/index.m3u8',
      'https://www.youtube.com/@AlJazeera/live',
    ],
  },
  {
    name: 'Al Arabiya', icon: '📰', cat: 'News',
    servers: [
      'https://alarabiya.akamaized.net/hls/live/alarabiya/index.m3u8',
      'https://live-edge01.alarabiya.net/alarabiya/index.m3u8',
      'https://cdn-live.alarabiya.net/alarabiya/playlist.m3u8',
      'https://www.youtube.com/@AlArabiya/live',
    ],
  },
  {
    name: 'Dubai TV', icon: '🏙️', cat: 'General',
    servers: [
      'https://dubaitv.akamaized.net/hls/live/dubaitv/index.m3u8',
      'https://live-edge01.dubaitv.ae/dubaitv/index.m3u8',
      'https://cdn-live.dubaitv.ae/dubaitv/playlist.m3u8',
      'https://www.youtube.com/@dubaitv/live',
    ],
  },
  {
    name: 'beIN Sports 1', icon: '⚽', cat: 'Sports',
    servers: [
      'https://bein-sports.akamaized.net/hls/live/beinsports1/index.m3u8',
      'https://edge01.beinsports.com/live/beinsports1/index.m3u8',
      'https://cdn-live.beinsports.com/bs1/playlist.m3u8',
      'https://www.youtube.com/@beINSPORTS_EN/live',
    ],
  },
  {
    name: 'Saudi TV 1', icon: '🇸🇦', cat: 'General',
    servers: [
      'https://sauditv.akamaized.net/hls/live/sauditv1/index.m3u8',
      'https://live-edge01.sauditv.sa/sauditv1/index.m3u8',
      'https://cdn-live.sauditv.sa/tv1/playlist.m3u8',
      'https://www.youtube.com/@sauditv1/live',
    ],
  },
];

// ── ─────────────────────────────────────────────────────────────────
//  TRANSLATIONS  (English / Arabic)
// ── ─────────────────────────────────────────────────────────────────
const STRINGS = {
  en: {
    home: 'Sahra home', watchRoom: 'Watch room', roomActions: 'Room actions', controls: 'Controls', dismissNotice: 'Dismiss notice',
    roomControls: 'Room controls', closeControls: 'Close room controls', profileMenu: 'Your profile and room options',
    screenReady: 'A little closer, wherever you are.', screenHint: 'Choose something to watch. Make an evening of it.',
    chooseVideo: 'Choose a video', nowWatching: 'Now watching', yourNextWatch: 'Your next watch starts here',
    youControl: 'You’re hosting', watchTogether: 'Watching together',
    videoSource: 'What are we watching?', sourceHelp: 'YouTube, a direct video link, or a file from your device.',
    videoLink: 'Video link', localFile: 'Open a file', subtitleLink: 'Subtitle link', subtitleLanguage: 'Subtitle language',
    uploadSubtitles: 'Upload .srt / .vtt', removeSubtitles: 'Remove', playback: 'Playback',
    inviteFriends: 'Better with company', inviteHint: 'Send this link to the people you want to watch with.',
    backToWatching: 'Back to watching', server: 'Server', chatWelcome: 'Save a seat for your friends.',
    chatWelcomeHint: 'Share the room link, then say hello. Messages stay in this room.', reactLabel: 'React', sendMessage: 'Send message',
    profileIntro: 'What should your friends call you?',
    nameRemembered: 'Saved on this browser. You can change it whenever you like.',
    saveName: 'Save & continue', changeName: 'Change name', cancel: 'Cancel', you: '(you)',
    connectionHelp: 'Room connection interrupted. Sync and chat will resume when connected.', retry: 'Reconnect',
    invalidMedia: 'Enter a valid HTTPS video or streaming-page link.',
    mediaFailed: 'This video could not play. Check the link, format, and whether the source allows playback here.',
    storageUnavailable: 'Your browser could not save your name. It will be used for this visit.',
    invalidRoom: 'Use a room code with 4–10 letters or numbers.',
    // Modal
    createParty:'Create Watch Party', joinParty:'Join Watch Party',
    createSub:'Start a watch party. Share the link, load a video, and watch together — perfectly in sync with everyone.',
    joinSub:"You've been invited to watch together. Pick a name and jump in — the party is already running!",
    roomWillBe:'Your room will be:', roomIdLabel:'Room ID',
    displayName:'Your display name',
    createPlaceholder:'e.g. CinemaHost, FilmBuff…', joinPlaceholder:'e.g. MovieFan, NightOwl…',
    createBtn:'Create a room', joinBtn:'Join the room',
    // Topbar
    noMedia:'No media loaded',
    statusLive:'Live', statusConnecting:'Connecting…', statusOffline:'Offline',
    roleHost:'⚡ Host', roleViewer:'👁 Viewer', leaveBtn:'Leave',
    // Control bar
    srcLabel:'Source', srcPlaceholder:'YouTube URL · https://example.com/film.mp4 · .webm · .m3u8',
    btnLoad:'Load', btnLiveTV:'Live TV', btnSyncAll:'Sync everyone', btnSync321:'3-2-1 Sync',
    syncPointLabel:'Sync Point', syncPointPlaceholder:'Type your current timestamp, e.g.  1:18:05  — then Announce',
    btnAnnounce:'Announce',
    subtitleLabel:'Subtitles', subtitlePlaceholder:'Subtitle URL (.vtt) — paste link and press Enter',
    btnAddCC:'+ CC',
    roomLinkLabel:'Room Link', btnCopy:'Copy', btnCopied:'✓ Copied', btnClaimHost:'Claim Host',
    btnNextServer:'Next Server →', serverSwitching:'Switching…',
    // Sidebar
    participants:'Participants', liveChat:'Room chat',
    chatPlaceholder:'Message the room…', connectingRoom:'Connecting to room…',
    hosting:'Hosting', watching:'Watching',
    // Video
    placeholderText:'Paste a video URL or any streaming site link below to begin',
    placeholderHint:'YouTube · .mp4 · .m3u8 · any streaming page',
    tapToUnmute:'Tap to Unmute',
    countdownLabel:'Get ready to press play',
    // Live TV panel
    liveTVTitle:'Live TV Channels',
    // Exit confirm
    leaveTitle:'Leave the Party?', stayBtn:'Stay & Watch', leaveConfirmBtn:'Leave Party',
    // Left screen
    leftTitle:"You've left the party",
    leftSub:'Hope you enjoyed the watch!\nStart a fresh party or share your room link to invite friends again.',
    newPartyBtn:'Start a new room', rejoinBtn:'Rejoin room',
    // Landing screen
    landingSub:'Watch movies and shows together, perfectly in sync.',
    createPartyBtn:'Create a room', joinWithCodeBtn:'Join with a room code',
    roomCodeLabel:'Room Code', roomCodePlaceholder:'Enter room code  (e.g. GMRO7Y)',
    enterRoomBtn:'Enter Room →', backBtn:'← Back',
  },
  ar: {
    home: 'الرئيسية', watchRoom: 'غرفة المشاهدة', roomActions: 'خيارات الغرفة', controls: 'التحكم', dismissNotice: 'إغلاق التنبيه',
    roomControls: 'إعدادات الغرفة', closeControls: 'إغلاق الإعدادات', profileMenu: 'ملفك وخيارات الغرفة',
    screenReady: 'أقرب، مهما كانت المسافة.', screenHint: 'اختر ما تحب مشاهدته، واسهر مع أصدقائك.',
    chooseVideo: 'اختر فيديو', nowWatching: 'نشاهد الآن', yourNextWatch: 'سهرتك القادمة تبدأ هنا',
    youControl: 'أنت المضيف', watchTogether: 'نشاهد معًا', videoSource: 'ماذا سنشاهد؟',
    sourceHelp: 'يوتيوب، رابط فيديو مباشر، أو ملف من جهازك.', videoLink: 'رابط الفيديو', localFile: 'فتح ملف',
    subtitleLink: 'رابط الترجمة', subtitleLanguage: 'لغة الترجمة', uploadSubtitles: 'رفع ملف ترجمة', removeSubtitles: 'إزالة',
    playback: 'التشغيل', inviteFriends: 'السهرة أحلى مع الأصدقاء', inviteHint: 'أرسل هذا الرابط لمن تحب المشاهدة معهم.',
    backToWatching: 'العودة للمشاهدة', server: 'الخادم', chatWelcome: 'احجز مكانًا لأصدقائك.',
    chatWelcomeHint: 'شارك رابط الغرفة، ثم قل مرحبًا. الرسائل تبقى في هذه الغرفة.', reactLabel: 'تفاعل', sendMessage: 'إرسال رسالة',
    profileIntro: 'بأي اسم تحب أن يناديك أصدقاؤك؟',
    nameRemembered: 'يُحفظ في هذا المتصفح، ويمكنك تغييره في أي وقت.',
    saveName: 'حفظ ومتابعة', changeName: 'تغيير الاسم', cancel: 'إلغاء', you: '(أنت)',
    connectionHelp: 'انقطع الاتصال بالغرفة. ستعود المزامنة والدردشة عند الاتصال.', retry: 'إعادة الاتصال',
    invalidMedia: 'أدخل رابط HTTPS صالحًا للفيديو أو صفحة المشاهدة.',
    mediaFailed: 'تعذر تشغيل الفيديو. تحقق من الرابط والصيغة وسماح المصدر بالتشغيل هنا.',
    storageUnavailable: 'تعذر حفظ اسمك في المتصفح. سيُستخدم لهذه الزيارة فقط.',
    invalidRoom: 'استخدم رمز غرفة من 4 إلى 10 أحرف إنجليزية أو أرقام.',
    // Modal
    createParty:'إنشاء حفلة مشاهدة', joinParty:'الانضمام إلى حفلة المشاهدة',
    createSub:'ابدأ حفلة مشاهدة. شارك الرابط، وتابع الفيديو معًا بشكل متزامن مع الجميع.',
    joinSub:'لقد تمت دعوتك للمشاهدة. اختر اسمًا وانضم — الحفلة جارية بالفعل!',
    roomWillBe:'غرفتك ستكون:', roomIdLabel:'رقم الغرفة',
    displayName:'اسم العرض',
    createPlaceholder:'مثال: سينما هوست، فيلم باف…', joinPlaceholder:'مثال: محب الأفلام، بومة الليل…',
    createBtn:'إنشاء غرفة', joinBtn:'الانضمام للغرفة',
    // Topbar
    noMedia:'لم يتم تحميل أي وسائط',
    statusLive:'مباشر', statusConnecting:'جاري الاتصال…', statusOffline:'غير متصل',
    roleHost:'⚡ مضيف', roleViewer:'👁 مشاهد', leaveBtn:'مغادرة',
    // Control bar
    srcLabel:'المصدر', srcPlaceholder:'رابط يوتيوب · https://example.com/film.mp4 · .m3u8',
    btnLoad:'تحميل', btnLiveTV:'بث مباشر', btnSyncAll:'مزامنة الكل', btnSync321:'عد تنازلي',
    syncPointLabel:'نقطة المزامنة', syncPointPlaceholder:'اكتب الوقت الحالي مثل  1:18:05  — ثم اضغط إعلان',
    btnAnnounce:'إعلان',
    subtitleLabel:'ترجمة', subtitlePlaceholder:'رابط ملف الترجمة (.vtt) — الصق واضغط Enter',
    btnAddCC:'+ ترجمة',
    roomLinkLabel:'رابط الغرفة', btnCopy:'نسخ', btnCopied:'✓ تم النسخ', btnClaimHost:'أخذ الإدارة',
    btnNextServer:'الخادم التالي ←', serverSwitching:'جاري التبديل…',
    // Sidebar
    participants:'المشاركون', liveChat:'دردشة الغرفة',
    chatPlaceholder:'اكتب رسالة…', connectingRoom:'جاري الاتصال بالغرفة…',
    hosting:'يستضيف', watching:'يشاهد',
    // Video
    placeholderText:'الصق رابط الفيديو أو أي رابط بث أسفله للبدء',
    placeholderHint:'يوتيوب · mp4. · m3u8. · أي صفحة بث',
    tapToUnmute:'انقر لرفع الكتم',
    countdownLabel:'استعد للضغط على تشغيل',
    // Live TV panel
    liveTVTitle:'قنوات البث المباشر',
    // Exit confirm
    leaveTitle:'مغادرة الحفلة؟', stayBtn:'البقاء والمشاهدة', leaveConfirmBtn:'مغادرة الحفلة',
    // Left screen
    leftTitle:'لقد غادرت الحفلة',
    leftSub:'نأمل أنك استمتعت بالمشاهدة!\nابدأ حفلة جديدة أو شارك رابط الغرفة لدعوة أصدقائك مجددًا.',
    newPartyBtn:'بدء غرفة جديدة', rejoinBtn:'إعادة الانضمام',
    // Landing screen
    landingSub:'شاهد الأفلام والمسلسلات معاً بتزامن تام.',
    createPartyBtn:'إنشاء غرفة', joinWithCodeBtn:'الانضمام برمز الغرفة',
    roomCodeLabel:'رمز الغرفة', roomCodePlaceholder:'أدخل رمز الغرفة  (مثال: GMRO7Y)',
    enterRoomBtn:'← دخول الغرفة', backBtn:'رجوع →',
  },
};

const AVATAR_PALETTE = [
  '#60504b', '#495b54', '#50566a', '#69583e', '#574c60',
  '#49616a', '#6c4c4c', '#545e42', '#65554d', '#485560',
];

// ── ─────────────────────────────────────────────────────────────────
//  UTILITIES
// ── ─────────────────────────────────────────────────────────────────
const isDemoMode = () => SUPABASE_URL.includes('YOUR_PROJECT');

/**
 * Keep the Supabase free-tier project alive by touching its health endpoint.
 * Uses /auth/v1/health which supports CORS from any origin (unlike /rest/v1/).
 */
async function pingSupabase() {
  if (isDemoMode()) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire a lightweight ping every 3 days to keep the free-tier project
 * from being auto-paused after 7 days of inactivity.
 */
function scheduleKeepAlive() {
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
  const ping = () => {
    pingSupabase().then(ok => {
      if (!ok) console.warn('[Sahra] Keep-alive ping failed — project may be pausing.');
    });
  };
  setInterval(ping, THREE_DAYS_MS);
}

function makeRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function roomFromUrl() {
  const code = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
  return code && /^[A-Z0-9]{4,10}$/.test(code) ? code : null;
}

function pushRoomToUrl(id) {
  const u = new URL(window.location.href);
  u.searchParams.set('room', id);
  window.history.replaceState({}, '', u.toString());
}

function hhMm(ms) {
  return new Date(ms).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function djb2(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h);
}

function colorOf(username) {
  return AVATAR_PALETTE[djb2(username) % AVATAR_PALETTE.length];
}

/**
 * Detect YouTube URLs and extract the 11-character video ID.
 * Handles: youtube.com/watch?v=  ·  youtu.be/  ·  youtube.com/shorts/  ·  /embed/
 * Returns { type: 'youtube', id } or { type: 'native' }
 */
function parseVideoUrl(url) {
  const yt = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  if (yt) return { type: 'youtube', id: yt[1] };
  return { type: 'native' };
}

/**
 * Returns true if the URL points to a playable media file
 * (native <video> can handle it directly).
 */
function isDirectMediaUrl(url) {
  return /\.(mp4|webm|mkv|ogg|ogv|mov|m3u8|mpd|flv|wmv|ts|avi)(\?.*)?$/i.test(url);
}

/**
 * Lazily load the YouTube IFrame Player API script once.
 * Resolves immediately if YT is already on the page.
 */
function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) { resolve(); return; }
    // Chain onto any existing ready callback (e.g. another call in-flight)
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    }
  });
}

let _uid = 0;
const uid = () => ++_uid;

// ════════════════════════════════════════════════════════════════════
//  VUE 3 APP
// ════════════════════════════════════════════════════════════════════
// Storage may be unavailable in private or restricted browser sessions.
const preferences = {
  get(key, session = false) {
    try { return (session ? sessionStorage : localStorage).getItem(key); } catch { return null; }
  },
  set(key, value, session = false) {
    try { (session ? sessionStorage : localStorage).setItem(key, value); return true; } catch { return false; }
  },
  remove(key, session = false) {
    try { (session ? sessionStorage : localStorage).removeItem(key); } catch {}
  },
};
const { createApp, ref, computed, watch, onMounted, onUnmounted, nextTick } = Vue;

createApp({
  setup() {

    // ────────────────────────────────────────────────────────
    //  LANGUAGE / i18n
    // ────────────────────────────────────────────────────────
    const lang  = ref(preferences.get('sahra_lang') === 'ar' ? 'ar' : 'en');
    const isRTL = computed(() => lang.value === 'ar');

    // t(key) — reactive translation helper
    // Reads lang.value so Vue re-renders the template on language change
    function t(key) {
      return STRINGS[lang.value]?.[key] ?? STRINGS.en[key] ?? key;
    }

    function toggleLang() {
      lang.value = lang.value === 'en' ? 'ar' : 'en';
      preferences.set('sahra_lang', lang.value);
      applyLocale();
    }

    function applyLocale() {
      document.documentElement.lang = lang.value;
      document.documentElement.dir = lang.value === 'ar' ? 'rtl' : 'ltr';
    }

    function focusNameInput() {
      if (!window.matchMedia || window.matchMedia('(min-width: 761px)').matches) nameInputRef.value?.focus();
    }

    // Auto-detect Arabic text for per-message RTL direction
    function msgDir(text) {
      return /[؀-ۿ]/.test(text) ? 'rtl' : 'ltr';
    }

    // ────────────────────────────────────────────────────────
    //  ROOM & IDENTITY STATE
    // ────────────────────────────────────────────────────────
    const roomId   = ref('');
    const nickname = ref((preferences.get('sahra_nick') || '').trim().slice(0, 24));
    const participantId = crypto.randomUUID();
    let hostSince = Date.now();
    const presenceProfile = () => ({ username: nickname.value, isHost: isHost.value, hostSince });
    const mediaError = ref('');
    let nameReturnMode = 'landing';
    let syncTimer = null;
    const isHost   = ref(false);
    const showModal    = ref(false);
    const nameInput    = ref('');
    const nameInputRef = ref(null);
    const modalMode     = ref('landing'); // 'landing' | 'create' | 'joinCode' | 'join'
    const joinCodeInput = ref('');
    const joinCodeRef   = ref(null);
    const controlsDialog = ref(null);
    const showControls = ref(false);
    const accountMenu = ref(null);

    function closeAccount() {
      if (accountMenu.value) accountMenu.value.open = false;
    }

    function openControls() {
      closeAccount();
      if (!controlsDialog.value || controlsDialog.value.open) return;
      controlsDialog.value.showModal();
      showControls.value = true;
    }

    function closeControls() {
      controlsDialog.value?.close();
      showControls.value = false;
    }

    function onControlsBackdrop(event) {
      if (event.target !== controlsDialog.value) return;
      const bounds = controlsDialog.value.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeControls();
    }

    // visualViewport keeps the composer above mobile keyboards as they open.
    function updateViewport() {
      document.documentElement.style?.setProperty('--app-height', `${window.visualViewport?.height || window.innerHeight}px`);
    }
    function onPageClick(event) {
      if (accountMenu.value && !accountMenu.value.contains(event.target)) closeAccount();
    }
    function onPageKey(event) {
      if (event.key === 'Escape' && accountMenu.value?.open) {
        closeAccount();
        accountMenu.value.querySelector('summary')?.focus();
      }
    }

    // true  → user arrived via a shared ?room= link (JOIN mode)
    // false → room was auto-generated, this person is the creator
    const wasInUrl = ref(false);

    // Exit-party UI state
    const showExitConfirm = ref(false);
    const hasLeft         = ref(false);

    // ────────────────────────────────────────────────────────
    //  CONNECTION STATE
    // ────────────────────────────────────────────────────────
    const connStatus = ref('disconnected'); // 'connecting' | 'connected' | 'disconnected'

    // ────────────────────────────────────────────────────────
    //  VIDEO STATE
    // ────────────────────────────────────────────────────────
    const videoEl      = ref(null);
    const videoWrapper = ref(null);
    const videoSrc     = ref('');
    const urlInput     = ref('');
    const localFileRef = ref(null); // ref to the hidden local-video file input
    const videoTitle   = ref('');
    const syncPulse   = ref(false);
    // True while the peer is in muted-autoplay state.
    // The video plays silently so host controls work immediately;
    // the badge lets the peer unmute with one click.
    const needsUnmute = ref(false);

    // 'native' = direct file URL  |  'youtube' = YouTube IFrame API  |  'iframe' = embedded webpage
    const videoType      = ref('native');
    const ytVideoId      = ref('');    // YouTube video ID
    const iframeSrc      = ref('');    // URL for iframe embed mode
    const showIframeNotice = ref(true);// dismissable tip shown over the iframe

    // 3-2-1 countdown sync (used in iframe mode)
    const showCountdown  = ref(false);
    const countdownNum   = ref(3);
    let   countdownTimer = null;

    // Sync Point: host manually types their current playback position
    // so peers know where to seek before the 3-2-1 countdown fires
    const syncTimeInput = ref('');

    // ────────────────────────────────────────────────────────
    //  SUBTITLES (Video.js text tracks)
    // ────────────────────────────────────────────────────────
    const subtitleUrl     = ref('');
    const subtitleLang    = ref('en');
    const activeCcLabel   = ref(''); // e.g. "EN", "AR" — empty when no CC loaded
    const subtitleFileRef = ref(null); // ref to the hidden <input type="file">

    // ────────────────────────────────────────────────────────
    //  LIVE TV
    // ────────────────────────────────────────────────────────
    const showChannelPicker  = ref(false);
    const activeChannel      = ref('');      // channel name currently tuned
    const activeServerIndex  = ref(0);       // which server (0-3) is active
    const serverRetrying     = ref(false);   // true while auto-switching servers

    // Computed HTML string for the iframe notice bar
    // (uses v-html so <strong> renders correctly)
    const iframeNoticeHtml = computed(() => isHost.value
      ? '🎬 <strong>Host:</strong> Seek to your start point → type the timestamp in <strong>Sync Point</strong> → press <strong>Announce</strong> → then <strong>3-2-1 Sync</strong>'
      : '🎬 <strong>Viewer:</strong> Seek to the timestamp announced in chat, then wait for the <strong>3-2-1 countdown</strong> — press play on GO!'
    );

    // Video.js player instance (not reactive — plain JS object)
    // Handles: HLS streams, MP4, WebM, subtitle / CC tracks
    let vjsPlayer = null;

    // If a playback_control broadcast arrives before vjsPlayer is ready,
    // store it here and apply it as soon as the player finishes initialising.
    let pendingRemoteCmd = null;

    // YouTube IFrame Player instance (not reactive — plain JS object)
    let ytPlayer = null;

    // Prevents our own video event handlers from re-broadcasting
    // when we programmatically apply a remote command
    let remoteApply       = false;
    // Prevents video_source broadcast loop when peer auto-loads a video
    let remoteSourceApply = false;
    let seekTimer         = null;
    let syncPulseTimer    = null;

    // ────────────────────────────────────────────────────────
    //  PRESENCE / PARTICIPANTS
    // ────────────────────────────────────────────────────────
    const onlineUsers = ref([]); // Array<{ key, username, isHost }>

    // ────────────────────────────────────────────────────────
    //  CHAT
    // ────────────────────────────────────────────────────────
    const messages  = ref([]);
    const chatDraft = ref('');
    const msgArea   = ref(null);
    const EMOJIS    = QUICK_EMOJIS;

    // ────────────────────────────────────────────────────────
    //  FLOATING EMOJI LAYER
    // ────────────────────────────────────────────────────────
    const floaters  = ref([]); // Array<{ id, char, x }>

    // ────────────────────────────────────────────────────────
    //  UI / TOASTS
    // ────────────────────────────────────────────────────────
    const linkCopied = ref(false);
    const toasts     = ref([]);

    const fullRoomUrl = computed(() => {
      const u = new URL(window.location.href);
      u.searchParams.set('room', roomId.value);
      return u.toString();
    });

    // ────────────────────────────────────────────────────────
    //  SUPABASE REFS
    // ────────────────────────────────────────────────────────
    let sb      = null; // Supabase client
    let channel = null; // Realtime channel

    // ════════════════════════════════════════════════════════
    //  BOOTSTRAP — runs on mount
    // ════════════════════════════════════════════════════════
    onMounted(async () => {
      applyLocale();
      updateViewport();
      window.visualViewport?.addEventListener('resize', updateViewport);
      window.addEventListener?.('resize', updateViewport);
      document.addEventListener?.('click', onPageClick);
      document.addEventListener?.('keydown', onPageKey);
      const rid = roomFromUrl();
      if (!nickname.value) {
        if (rid) { wasInUrl.value = true; roomId.value = rid; }
        modalMode.value = 'profile';
        showModal.value = true;
        await nextTick();
        focusNameInput();
        return;
      }
      if (rid) {
        // Arriving via shared link → go straight to JOIN
        wasInUrl.value = true;
        roomId.value   = rid;
        const saved = nickname.value;
        if (saved) {
          nickname.value = saved;
          await boot();
        } else {
          modalMode.value = 'join';
          showModal.value = true;
          await nextTick();
          focusNameInput();
        }
      } else {
        // No room in URL → show landing so user can choose Create or Join
        modalMode.value = 'landing';
        showModal.value = true;
      }
    });

    onUnmounted(teardown);
    onUnmounted(() => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.removeEventListener?.('resize', updateViewport);
      document.removeEventListener?.('click', onPageClick);
      document.removeEventListener?.('keydown', onPageKey);
    });

    function editName() {
      nameReturnMode = showModal.value ? modalMode.value : null;
      nameInput.value = nickname.value;
      modalMode.value = 'editName';
      showModal.value = true;
      nextTick(focusNameInput);
    }

    function cancelNameEdit() {
      modalMode.value = nameReturnMode || 'landing';
      showModal.value = !!nameReturnMode;
    }

    async function saveProfile() {
      const name = nameInput.value.trim().slice(0, 24);
      if (!name) return;
      nickname.value = name;
      if (!preferences.set('sahra_nick', name)) toast(t('storageUnavailable'));
      if (modalMode.value === 'editName') {
        if (channel && connStatus.value === 'connected') {
          await channel.track(presenceProfile());
        }
        cancelNameEdit();
      } else if (roomId.value) {
        showModal.value = false;
        await boot();
      } else {
        modalMode.value = 'landing';
      }
    }

    // ── Landing → Create: generate a fresh room and switch to create mode
    function chooseModeCreate() {
      const rid      = makeRoomId();
      roomId.value   = rid;
      wasInUrl.value = false;
      pushRoomToUrl(rid);
      if (nickname.value) {
        showModal.value = false;
        boot();
        return;
      }
      nameInput.value = nickname.value;
      modalMode.value = 'create';
      nextTick(focusNameInput);
    }

    // ── Landing → Join: show the room-code input
    function chooseModeJoin() {
      joinCodeInput.value = '';
      modalMode.value     = 'joinCode';
      nextTick(() => joinCodeRef.value?.focus());
    }

    // ── Join by code: navigate to ?room=CODE (full reload triggers join flow)
    function confirmJoinCode() {
      const code = joinCodeInput.value.trim().toUpperCase();
      if (!/^[A-Z0-9]{4,10}$/.test(code)) { toast(t('invalidRoom')); return; }
      const u = new URL(window.location.href);
      u.searchParams.set('room', code);
      window.location.href = u.toString();
    }

    // ── Confirm nickname from modal
    async function confirmName() {
      const n = nameInput.value.trim();
      if (!n) return;
      nickname.value = n;
      preferences.set('sahra_nick', n);
      showModal.value = false;
      await boot();
    }

    // ── Full app boot after we have a nickname
    async function boot() {
      const hk = `sahra_host_${roomId.value}`;
      if (!wasInUrl.value && !preferences.get(hk, true)) {
        // Room creator on first load: auto-become host
        isHost.value = true;
        preferences.set(hk, '1', true);
      } else if (preferences.get(hk, true)) {
        // Same-tab refresh for anyone who held host in this tab: restore
        isHost.value = true;
      }
      // Joiners arriving via a shared link start as viewers

      sysMsg(`You joined room ${roomId.value} as ${isHost.value ? 'Host ⚡' : 'Viewer 👁'}`);

      if (isDemoMode()) {
        // ── Demo / offline mode: UI works, no real sync ──
        connStatus.value  = 'connected';
        onlineUsers.value = [{
          key: participantId,
          username: nickname.value,
          isHost: isHost.value,
        }];
        sysMsg('⚠ Running in demo mode. Add Supabase credentials for real-time sync.');
      } else {
        sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        await joinChannel();
      }
    }

    // ════════════════════════════════════════════════════════
    //  SUPABASE CHANNEL — single channel per room
    // ════════════════════════════════════════════════════════
    async function joinChannel() {
      connStatus.value = 'connecting';

      /*
       * One channel: `sahra:room:<ROOM_ID>`
       * Presence  → participant list
       * Broadcast `playback_control` → video sync
       * Broadcast `chat_message`     → chat
       * Broadcast `emoji_reaction`   → floating emojis
       */
      channel = sb.channel(`sahra:room:${roomId.value}`, {
        config: {
          presence:  { key: participantId },
          broadcast: { self: false },   // don't echo our own broadcasts back to us
        },
      });

      // ── Presence: full sync ──────────────────────────────
      channel.on('presence', { event: 'sync' }, async () => {
        const state = channel.presenceState();
        onlineUsers.value = Object.entries(state).map(([key, slots]) => ({
          key,
          username: slots[0]?.username ?? key,
          isHost:   slots[0]?.isHost   ?? false,
          hostSince: slots[0]?.hostSince ?? 0,
        }));
        // Resolve simultaneous claims and hosts returning after a disconnect.
        const hosts = onlineUsers.value.filter(user => user.isHost).sort((a, b) =>
          b.hostSince - a.hostSince || b.key.localeCompare(a.key));
        const winner = hosts[0];
        if (isHost.value && winner && winner.key !== participantId &&
          (winner.hostSince > hostSince || (winner.hostSince === hostSince && winner.key.localeCompare(participantId) > 0))) {
          isHost.value = false;
          preferences.remove(`sahra_host_${roomId.value}`, true);
          await channel.track(presenceProfile());
        }
      });

      channel.on('presence', { event: 'join' }, ({ key, newPresences }) => {
        const who = newPresences[0]?.username ?? key;
        if (key !== participantId) {
          sysMsg(`${who} joined the room`);
          // Auto-push the current video state to the new joiner.
          // Delay 1.8 s so their Supabase broadcast subscription is
          // fully established before we send.
          if (isHost.value) setTimeout(broadcastCurrentState, 1800);
        }
      });

      channel.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        const who = leftPresences[0]?.username ?? key;
        sysMsg(`${who} left the room`);
      });

      // ── Broadcast: playback_control ──────────────────────
      channel.on('broadcast', { event: 'playback_control' }, ({ payload }) => {
        if (isHost.value || !payload || !['play', 'pause', 'seek'].includes(payload.action) || !Number.isFinite(payload.ts) || payload.ts < 0) return;
        // If we have no video loaded yet, ask host to resend the full state
        // instead of applying a timestamp to nothing.
        const hasVideo = videoSrc.value || ytVideoId.value || iframeSrc.value;
        if (!hasVideo) {
          emit('request_state', { from: nickname.value });
          return;
        }
        applyRemote(payload);
      });

      // ── Broadcast: request_state ──────────────────────────
      // A peer is asking the host to re-broadcast the current state
      // (happens when they receive a playback_control but have no video yet)
      channel.on('broadcast', { event: 'request_state' }, ({ payload }) => {
        if (!isHost.value) return;
        sysMsg(`↩ Re-syncing state to ${payload?.from ?? 'peer'}…`);
        setTimeout(broadcastCurrentState, 400);
      });

      // ── Broadcast: host_takeover ────────────────────────────
      // Fired when someone claims host. All current hosts step down so
      // there is always exactly ONE host badge shown in the sidebar.
      channel.on('broadcast', { event: 'host_takeover' }, async ({ payload }) => {
        if (!isHost.value) return; // already a viewer — nothing to do
        if (payload?.hostSince && (payload.hostSince < hostSince ||
          (payload.hostSince === hostSince && payload.participantId < participantId))) return;
        // Someone else took over — demote ourselves
        isHost.value = false;
        preferences.remove(`sahra_host_${roomId.value}`, true);
        if (channel) {
          await channel.track(presenceProfile());
        }
        sysMsg(`${payload?.newHost ?? 'Someone'} is now the Host`);
      });

      // ── Broadcast: chat_message ──────────────────────────
      channel.on('broadcast', { event: 'chat_message' }, ({ payload }) => {
        pushMsg({
          id:     uid(),
          type:   'chat',
          author: payload.user,
          body:   payload.text,
          time:   hhMm(payload.ts),
          isHost: payload.isHost ?? false,
        });
      });

      // ── Broadcast: emoji_reaction ────────────────────────
      channel.on('broadcast', { event: 'emoji_reaction' }, ({ payload }) => {
        spawnEmoji(payload.emoji);
      });

      // ── Broadcast: iframe_countdown ───────────────────────
      // Host sent the 3-2-1 countdown — show it on all peer screens.
      channel.on('broadcast', { event: 'iframe_countdown' }, () => {
        startCountdown();
      });

      // ── Broadcast: video_source ───────────────────────────
      // Fired when the Host loads a new video (any type).
      // Peers receive it and auto-load the same source so no one has to
      // manually paste the URL themselves.
      channel.on('broadcast', { event: 'video_source' }, ({ payload }) => {
        if (isHost.value) return; // guard (self:false already prevents echo)
        if (!payload || !['native', 'youtube', 'iframe'].includes(payload.type)) return;
        if (payload.url?.startsWith('blob:')) return;

        // ── Same-source guard ─────────────────────────────────────────────────
        // broadcastCurrentState() is called on every "Sync All" press, which
        // always includes a video_source event even when the video hasn't changed.
        // If the peer already has the same source loaded, calling loadVideo()
        // again would restart the video from 0 (vjs.src() resets position) and
        // show the "Click to Watch" overlay unnecessarily.
        // Solution: skip the reload entirely — the playback_control that arrives
        // right after this event will handle the position / play-state sync.
        const alreadySameSource =
          (payload.type === 'native'  && payload.url === videoSrc.value  && videoType.value === 'native')  ||
          (payload.type === 'youtube' && payload.id  === ytVideoId.value && videoType.value === 'youtube') ||
          (payload.type === 'iframe'  && payload.url === iframeSrc.value && videoType.value === 'iframe');

        if (alreadySameSource) return; // position sync handled by the upcoming playback_control

        // ── New source — load it ──────────────────────────────────────────────
        remoteSourceApply = true;

        // Reconstruct the URL the peer should load
        urlInput.value =
          payload.type === 'youtube'
            ? `https://www.youtube.com/watch?v=${payload.id}`
            : (payload.url || '');

        const typeLabel =
          payload.type === 'youtube' ? 'YouTube video' :
          payload.type === 'iframe'  ? 'streaming page' :
                                       'video';

        loadVideo().finally(() => { remoteSourceApply = false; });
        sysMsg(`▶ Host loaded a ${typeLabel}`);
      });

      // ── Subscribe then begin presence tracking ───────────
      await channel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          // SUBSCRIBED = WebSocket handshake + Realtime channel confirmed.
          // This is the reliable connectivity signal — REST ping is separate
          // and fails on GitHub Pages due to CORS, so we don't use it here.
          connStatus.value = 'connected';
          // Schedule a keep-alive ping every 3 days to prevent auto-pausing
          await channel.track(presenceProfile());
          if (!isHost.value) emit('request_state', { from: nickname.value });
          clearInterval(syncTimer);
          syncTimer = setInterval(() => {
            if (connStatus.value === 'connected' && isHost.value) broadcastCurrentState();
          }, 10000);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          connStatus.value = 'disconnected';
          sysMsg('⚠ Connection lost — retrying…');
        } else if (status === 'CLOSED') {
          connStatus.value = 'disconnected';
        }
      });
    }

    async function teardown() {
      clearInterval(syncTimer);
      clearTimeout(seekTimer);
      connStatus.value = 'disconnected';
      onlineUsers.value = [];
      if (channel) {
        await channel.untrack().catch(() => {});
        await sb?.removeChannel(channel).catch(() => {});
        channel = null;
      }
    }

    async function reconnect() {
      if (connStatus.value === 'connecting' || hasLeft.value) return;
      await teardown();
      connStatus.value = 'connecting';
      await joinChannel();
    }

    // ════════════════════════════════════════════════════════
    //  VIDEO — Host event handlers
    // ════════════════════════════════════════════════════════

    /** Called by the native `play` event */
    function onPlay() {
      if (!isHost.value || remoteApply) return;
      emit('playback_control', { action: 'play',  ts: videoEl.value?.currentTime ?? 0 });
    }

    /** Called by the native `pause` event */
    function onPause() {
      if (!isHost.value || remoteApply) return;
      emit('playback_control', { action: 'pause', ts: videoEl.value?.currentTime ?? 0 });
    }

    /** Called by the native `seeked` event — debounced to avoid flooding */
    function onSeeked() {
      if (!isHost.value || remoteApply) return;
      clearTimeout(seekTimer);
      seekTimer = setTimeout(() => {
        emit('playback_control', { action: 'seek', ts: videoEl.value?.currentTime ?? 0 });
      }, SEEK_DEBOUNCE_MS);
    }

    /**
     * Run the 3-2-1 countdown locally.
     * Called both on the Host (who triggered it) and on every Peer
     * that receives the `iframe_countdown` broadcast.
     */
    function startCountdown() {
      clearTimeout(countdownTimer);
      showCountdown.value = true;
      countdownNum.value  = 3;
      let n = 3;

      const tick = () => {
        countdownNum.value = n;
        if (n === 0) {
          // "GO!" frame — hide after 900 ms
          countdownTimer = setTimeout(() => {
            showCountdown.value = false;
          }, 900);
          return;
        }
        n--;
        countdownTimer = setTimeout(tick, 1000);
      };
      tick();
    }

    /**
     * Broadcast the host's manually-entered timestamp to all peers via chat.
     * Peers see it in the chat panel and manually seek their iframe to that point.
     * After seeking, host fires 3-2-1 Sync so everyone presses play together.
     */
    function broadcastSyncPoint() {
      const t = syncTimeInput.value.trim();
      if (!t) return;

      const body = `📍 Seek to  ${t}  — then wait for the 3-2-1 countdown to press play`;
      const ts   = Date.now();

      // Show locally
      pushMsg({ id: uid(), type: 'chat', author: '⚡ Sync', body, time: hhMm(ts), isHost: true });

      // Broadcast to peers
      emit('chat_message', { user: '⚡ Sync', text: body, ts, isHost: true });

      toast(`Sync point "${t}" announced — fire 3-2-1 Sync when everyone is ready`);
      syncTimeInput.value = '';
    }

    /**
     * Broadcast the full current playback state (source URL + position + play/pause)
     * to every peer in the room. Called automatically when a peer joins, and
     * manually via the "Sync All" / "3-2-1 Sync" buttons.
     */
    function broadcastCurrentState() {
      if (!isHost.value) return;

      if (videoType.value === 'youtube' && ytVideoId.value) {
        // ── YouTube ──────────────────────────────────────────
        emit('video_source', { type: 'youtube', id: ytVideoId.value });
        if (ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
          const state  = ytPlayer.getPlayerState();
          const action = state === YT.PlayerState.PLAYING ? 'play' : 'pause';
          emit('playback_control', { action, ts: ytPlayer.getCurrentTime() });
        }

      } else if (videoType.value === 'native' && videoSrc.value) {
        // ── Video.js / native ────────────────────────────────
        if (!videoSrc.value.startsWith('blob:')) emit('video_source', { type: 'native', url: videoSrc.value });
        if (vjsPlayer) {
          emit('playback_control', {
            action: vjsPlayer.paused() ? 'pause' : 'play',
            ts:     vjsPlayer.currentTime(),
          });
        }

      } else if (videoType.value === 'iframe' && iframeSrc.value) {
        // ── Iframe ───────────────────────────────────────────
        emit('video_source', { type: 'iframe', url: iframeSrc.value });
      }
    }

    /** Manual sync button. Also re-sends the source so late-joiners get the video. */
    function forceSyncPeers() {
      if (!isHost.value) return;

      if (videoType.value === 'iframe') {
        // Iframe: re-send source + fire the 3-2-1 countdown
        broadcastCurrentState();
        emit('iframe_countdown', {});
        startCountdown();
        toast('3-2-1 countdown sent — press play when you see GO!');
      } else {
        // YouTube / native: re-send source + playback position
        broadcastCurrentState();
        toast('Sync broadcast sent — source + timestamp pushed to all viewers');
      }
    }

    /**
     * Called when a peer clicks the "🔇 Tap to Unmute" badge.
     *
     * The video was already auto-playing muted (browsers always allow muted
     * autoplay), so host play/pause/seek controls were already working.
     * This click simply enables audio and registers a user gesture so that
     * any future unmuted play() call (after a host-triggered pause) succeeds.
     */
    function unmutePeer() {
      needsUnmute.value = false;
      if (vjsPlayer) vjsPlayer.muted(false);
    }

    // ── Apply a remote playback command received from the Host ──
    //
    // Race condition: video_source and playback_control arrive almost
    // simultaneously. loadVideo() sets videoSrc.value synchronously (so
    // hasVideo = true), but vjsPlayer is initialised asynchronously (nextTick
    // + Video.js init). If applyRemote fires before init completes, vjsPlayer
    // is still null — the command must NOT be silently dropped.
    //
    // Fix: store the command in pendingRemoteCmd. initVideoJsPlayer() drains
    // it the moment the player is ready.
    function applyRemote(cmd) {
      const { action, ts } = cmd;
      if (videoType.value === 'iframe') return;
      if (videoType.value === 'youtube' && (!ytPlayer || typeof ytPlayer.getPlayerState !== 'function')) {
        pendingRemoteCmd = cmd;
        return;
      }
      if (videoType.value === 'native' && (!vjsPlayer || vjsPlayer.readyState() < 1)) {
        pendingRemoteCmd = cmd;
        return;
      }

      if (videoType.value === 'youtube' && ytPlayer && typeof ytPlayer.getPlayerState === 'function') {
        // ── YouTube sync ──────────────────────────────────────
        flashSync();
        remoteApply = true;

        const currentT = ytPlayer.getCurrentTime?.() ?? 0;
        const drift    = Math.abs(currentT - ts);

        if (action === 'play') {
          if (drift > DRIFT_THRESHOLD) ytPlayer.seekTo(ts, true);
          ytPlayer.playVideo();
        } else if (action === 'pause') {
          if (drift > DRIFT_THRESHOLD) ytPlayer.seekTo(ts, true);
          ytPlayer.pauseVideo();
        } else if (action === 'seek') {
          ytPlayer.seekTo(ts, true);
        }

        setTimeout(() => { remoteApply = false; }, 650);

      } else {
        // ── Video.js sync ─────────────────────────────────────
        if (!vjsPlayer) {
          // Player not ready yet — queue and wait; initVideoJsPlayer drains
          // this as soon as the player finishes initialising.
          pendingRemoteCmd = cmd;
          return;
        }

        flashSync();
        remoteApply = true;

        const drift = Math.abs(vjsPlayer.currentTime() - ts);

        if (action === 'play') {
          if (drift > DRIFT_THRESHOLD) vjsPlayer.currentTime(ts);
          if (vjsPlayer.paused()) {
            // Try unmuted play first; fall back to muted if browser blocks it
            // (happens if the user has never interacted with the page at all).
            vjsPlayer.play().catch(() => {
              vjsPlayer.muted(true);
              vjsPlayer.play().catch(() => {});
              needsUnmute.value = true; // show badge so they can unmute
            });
          }
          // If already playing (muted autoplay) we only needed the seek above.
        } else if (action === 'pause') {
          if (drift > DRIFT_THRESHOLD) vjsPlayer.currentTime(ts);
          vjsPlayer.pause();
        } else if (action === 'seek') {
          vjsPlayer.currentTime(ts);
        }

        // Release guard after player events have settled
        setTimeout(() => { remoteApply = false; }, 650);
      }
    }

    function flashSync() {
      syncPulse.value = true;
      clearTimeout(syncPulseTimer);
      syncPulseTimer = setTimeout(() => { syncPulse.value = false; }, 1300);
    }

    // ════════════════════════════════════════════════════════
    //  VIDEO.JS — player init + subtitle management
    // ════════════════════════════════════════════════════════

    /**
     * Create (once) or reuse the Video.js player instance.
     * Registers play / pause / seeked / error events through
     * Video.js so they stay in sync with VHS (HLS) internals.
     */
    async function initVideoJsPlayer() {
      if (vjsPlayer) return vjsPlayer;

      await nextTick();
      vjsPlayer = videojs('vjs-player', {
        controls:      true,
        preload:       'metadata',
        fill:          true,          // fills .video-wrapper
        playbackRates: [0.5, 0.75, 1, 1.25, 1.5, 2],
        html5: {
          vhs: {
            overrideNative: !videojs.browser.IS_SAFARI,
            enableLowInitialPlaylist: true,
          },
          nativeTextTracks: false,    // let Video.js render CC cues
        },
      });

      // Mirror host events to peers
      vjsPlayer.on('play', () => {
        if (!isHost.value || remoteApply) return;
        emit('playback_control', { action: 'play', ts: vjsPlayer.currentTime() });
      });
      vjsPlayer.on('pause', () => {
        if (!isHost.value || remoteApply) return;
        emit('playback_control', { action: 'pause', ts: vjsPlayer.currentTime() });
      });
      vjsPlayer.on('seeked', () => {
        if (!isHost.value || remoteApply) return;
        clearTimeout(seekTimer);
        seekTimer = setTimeout(() => {
          emit('playback_control', { action: 'seek', ts: vjsPlayer.currentTime() });
        }, SEEK_DEBOUNCE_MS);
      });
      vjsPlayer.on('error', () => {
        if (_currentTvChannelRef.value) tryNextServer();
        else mediaError.value = t('mediaFailed');
      });

      vjsPlayer.on('loadedmetadata', () => {
        if (pendingRemoteCmd && videoType.value === 'native') {
          const cmd = pendingRemoteCmd;
          pendingRemoteCmd = null;
          applyRemote(cmd);
        }
      });
      // ── Drain any queued remote command that arrived before we were ready ──
      // applyRemote() stores the command in pendingRemoteCmd when vjsPlayer is
      // null (race condition: playback_control beats the async player init).
      // Now that the player exists, apply it immediately.
      if (pendingRemoteCmd) {
        const cmd = pendingRemoteCmd;
        pendingRemoteCmd = null;
        // Small delay so the player has a chance to attach the media source
        setTimeout(() => applyRemote(cmd), 300);
      }

      return vjsPlayer;
    }

    // ── Subtitle helpers ──────────────────────────────────────

    const LANG_LABELS = {
      en: 'EN', ar: 'AR', fr: 'FR', de: 'DE', es: 'ES', tr: 'TR',
    };

    function addSubtitleTrack() {
      const url = subtitleUrl.value.trim();
      if (!vjsPlayer || !url) return;

      // Remove any existing subtitle/caption tracks first
      const existing = vjsPlayer.remoteTextTracks();
      for (let i = existing.length - 1; i >= 0; i--) {
        vjsPlayer.removeRemoteTextTrack(existing[i]);
      }

      const lang  = subtitleLang.value;
      const label = LANG_LABELS[lang] ?? lang.toUpperCase();

      vjsPlayer.addRemoteTextTrack({
        kind:    'subtitles',
        src:     url,
        srclang: lang,
        label,
        default: true,
      }, /* manualCleanup */ false);

      activeCcLabel.value = label;
      subtitleUrl.value   = '';
      toast(`✅ Subtitles loaded (${label}) — CC button is in the player controls`);

      // Sync to peers via chat notice
      const body = `🗒 Subtitles loaded: ${label}  —  ${url}`;
      pushMsg({ id: uid(), type: 'system', body });
      emit('chat_message', { user: '⚡ Sync', text: body, ts: Date.now(), isHost: true });
    }

    function clearSubtitles() {
      if (!vjsPlayer) return;
      const tracks = vjsPlayer.remoteTextTracks();
      for (let i = tracks.length - 1; i >= 0; i--) {
        vjsPlayer.removeRemoteTextTrack(tracks[i]);
      }
      activeCcLabel.value = '';
      toast('Subtitles removed');
    }

    /**
     * Load a subtitle file from the user's local disk.
     * Accepts .vtt (used as-is) and .srt (auto-converted to WebVTT).
     * Creates a temporary blob URL and feeds it into addSubtitleTrack().
     */
    /**
     * Load a local video file from the user's PC.
     * Creates a blob URL (local to this browser) and feeds it into loadVideo().
     * Blob URLs cannot be shared with peers — both sides must load the same
     * file themselves. Host play/pause/seek sync still works normally.
     */
    async function handleLocalFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = '';

      urlInput.value = URL.createObjectURL(file);
      await loadVideo();
      videoTitle.value = file.name; // override the garbage blob-URL title

      if (isHost.value) {
        const notice = `📁 Host loaded a local file: "${file.name}" — load the same file with the 📁 button to watch in sync`;
        pushMsg({ id: uid(), type: 'system', body: notice });
        emit('chat_message', { user: '⚡ Room', text: notice, ts: Date.now(), isHost: true });
      } else {
        sysMsg(`📁 Local file loaded: "${file.name}" — waiting for host sync`);
      }
    }

    function handleSubtitleFile(event) {
      const file = event.target.files?.[0];
      if (!file) return;
      event.target.value = ''; // reset so the same file can be re-selected

      const done = (blobUrl) => {
        subtitleUrl.value = blobUrl;
        addSubtitleTrack(); // Video.js built-in: addRemoteTextTrack() via blob URL
        toast(`📁 ${file.name}`);
      };

      if (!file.name.toLowerCase().endsWith('.srt')) {
        // VTT (or anything else): hand a blob URL straight to Video.js
        done(URL.createObjectURL(file));
        return;
      }

      // SRT: Video.js only parses WebVTT, so convert first (comma→dot in timestamps)
      const reader = new FileReader();
      reader.onload = (e) => {
        const vtt  = 'WEBVTT\n\n' +
          e.target.result
            .replace(/\r\n/g, '\n')
            .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
        done(URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })));
      };
      reader.readAsText(file, 'UTF-8');
    }

    // ════════════════════════════════════════════════════════
    //  VIDEO SOURCE — supports native URLs and YouTube
    // ════════════════════════════════════════════════════════

    /**
     * Parse the URL input and load either the Video.js player or
     * the YouTube IFrame player based on what the URL points to.
     */
    async function loadVideo() {
      if (!urlInput.value.trim()) return;
      try {
        await loadVideoSource();
        if (!mediaError.value) closeControls();
      }
      catch (error) {
        console.warn('Media load failed', error);
        mediaError.value = t('mediaFailed');
      }
    }

    async function loadVideoSource() {
      const u = urlInput.value.trim();
      if (!u) return;
      mediaError.value = '';
      try {
        const url = new URL(u);
        if (!['https:', 'blob:'].includes(url.protocol)) throw new Error('Invalid protocol');
      } catch { mediaError.value = t('invalidMedia'); return; }

      // Stop the previous source before displaying a different player.
      remoteApply = true;
      try {
        vjsPlayer?.pause();
        ytPlayer?.pauseVideo?.();
      } finally { remoteApply = false; }

      const parsed = parseVideoUrl(u);
      if (vjsPlayer) vjsPlayer.el().style.display = parsed.type === 'youtube' || !isDirectMediaUrl(u) ? 'none' : '';

      if (parsed.type === 'youtube') {
        // ── YouTube mode ─────────────────────────────────────
        videoType.value  = 'youtube';
        iframeSrc.value  = '';
        ytVideoId.value  = parsed.id;
        videoSrc.value   = '';
        videoTitle.value = `YouTube · ${parsed.id}`;

        await nextTick(); // ensure #yt-player-mount is visible in DOM
        await initYouTubePlayer(parsed.id);

        // Fetch human-readable title via public oEmbed (no API key needed)
        fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${parsed.id}&format=json`)
          .then(r => r.json())
          .then(d => { if (d.title) videoTitle.value = d.title; })
          .catch(() => {});

        // Host broadcasts the new source so all peers auto-load it
        if (isHost.value && !remoteSourceApply) {
          emit('video_source', { type: 'youtube', id: parsed.id });
        }

      } else if (isDirectMediaUrl(u)) {
        // ── Video.js native mode (.mp4 / .webm / .m3u8 / HLS) ─
        videoType.value  = 'native';
        ytVideoId.value  = '';
        iframeSrc.value  = '';
        videoSrc.value   = u;   // keeps v-show reactive
        try { videoTitle.value = decodeURIComponent(u.split('/').pop().split('?')[0]) || u; }
        catch { videoTitle.value = u; }

        await nextTick(); // ensure #vjs-player is visible in DOM
        const vjs = await initVideoJsPlayer();

        // Determine MIME type for Video.js VHS (HLS adaptive streaming)
        const mime = /\.m3u8/i.test(u) ? 'application/x-mpegURL'
                   : /\.webm/i.test(u) ? 'video/webm'
                   : /\.ogv?/i.test(u) ? 'video/ogg'
                   : /\.mpd/i.test(u)  ? 'application/dash+xml'
                   :                     'video/mp4';
        vjs.src({ src: u, type: mime });

        // Blob URLs are local to this browser — don't broadcast them to peers
        if (isHost.value && !remoteSourceApply && !u.startsWith('blob:')) {
          emit('video_source', { type: 'native', url: u });
        }

        // ── Peer muted autoplay ──────────────────────────────────────────────
        // Browsers always allow muted autoplay — no user gesture required.
        // Starting muted means host play/pause/seek broadcasts work immediately
        // (no "click to watch" interaction needed). The 🔇 badge lets the peer
        // unmute with one click, which also registers the gesture for future
        // unmuted play() calls triggered by the host.
        if (!isHost.value) {
          needsUnmute.value = true;
          vjsPlayer.muted(true);
          // Small delay so VHS/HLS has time to start buffering before play()
          setTimeout(() => {
            if (vjsPlayer && !isHost.value) {
              // Request host's exact current position (play/pause state + timestamp)
              emit('request_state', { from: nickname.value });
            }
          }, 500);
        }

      } else {
        // ── Iframe embed mode ─────────────────────────────────
        // Catches any URL that isn't YouTube or a direct media file:
        // streaming sites, Vimeo, Dailymotion, custom players, etc.
        videoType.value    = 'iframe';
        iframeSrc.value    = u;
        videoSrc.value     = '';
        ytVideoId.value    = '';
        showIframeNotice.value = true;
        try {
          videoTitle.value = new URL(u).hostname.replace('www.', '') + ' — embedded';
        } catch { videoTitle.value = 'Embedded player'; }

        if (isHost.value && !remoteSourceApply) {
          emit('video_source', { type: 'iframe', url: u });
        }

        toast('Streaming site loaded in embedded player');
      }

      toast('Media source loaded');
    }

    /**
     * Create or reuse the YouTube IFrame Player instance.
     * If already created, just calls loadVideoById() on the existing player.
     */
    async function initYouTubePlayer(videoId) {
      await loadYouTubeAPI();
      await nextTick();

      // Reuse existing player — just swap the video
      if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(videoId);
        return;
      }

      // Create a fresh player instance mounted on #yt-player-mount
      ytPlayer = new YT.Player('yt-player-mount', {
        videoId,
        width:  '100%',
        height: '100%',
        playerVars: {
          rel:             0,   // no related videos at end
          modestbranding:  1,   // minimal YouTube branding
          controls:        1,   // show native YouTube controls
          autoplay:        0,
        },
        events: {
          onReady() {
            toast('YouTube ready — Host controls playback for everyone');
            if (pendingRemoteCmd) {
              const cmd = pendingRemoteCmd;
              pendingRemoteCmd = null;
              applyRemote(cmd);
            }
            if (!isHost.value) emit('request_state', { from: nickname.value });
          },
          onError() { mediaError.value = t('mediaFailed'); },
          onStateChange(event) {
            // Only the Host broadcasts state changes
            if (!isHost.value || remoteApply) return;
            const S = window.YT.PlayerState;
            if (event.data === S.PLAYING) {
              // Debounce — YouTube fires PLAYING right after a seek too
              clearTimeout(seekTimer);
              seekTimer = setTimeout(() => {
                emit('playback_control', {
                  action: 'play',
                  ts: ytPlayer.getCurrentTime(),
                });
              }, 300);
            } else if (event.data === S.PAUSED) {
              emit('playback_control', {
                action: 'pause',
                ts: ytPlayer.getCurrentTime(),
              });
            }
          },
        },
      });
    }

    // ════════════════════════════════════════════════════════
    //  LIVE TV — multi-server with auto-fallback
    // ════════════════════════════════════════════════════════
    const _currentTvChannelRef = ref(null); // reactive so template can read servers list

    function loadChannel(ch, serverIdx = 0) {
      _currentTvChannelRef.value  = ch;
      activeChannel.value         = ch.name;
      activeServerIndex.value     = serverIdx;
      serverRetrying.value        = false;
      showChannelPicker.value     = false;

      urlInput.value = ch.servers[serverIdx];
      loadVideo();
      sysMsg(`📺 ${ch.name} — Server ${serverIdx + 1} of ${ch.servers.length}`);
    }

    function switchServer(idx) {
      if (!_currentTvChannelRef.value) return;
      loadChannel(_currentTvChannelRef.value, idx);
    }

    function tryNextServer() {
      const ch = _currentTvChannelRef.value;
      if (!ch) return;
      const next = activeServerIndex.value + 1;
      if (next >= ch.servers.length) {
        toast(`All ${ch.servers.length} servers tried for ${ch.name}`);
        return;
      }
      serverRetrying.value = true;
      toast(`Server ${activeServerIndex.value + 1} failed — trying Server ${next + 1}…`);
      loadChannel(ch, next);
    }

    // Called by the native <video> error event — auto-fallback to next server
    function onVideoError() {
      if (!_currentTvChannelRef.value) return;
      tryNextServer();
    }

    // ════════════════════════════════════════════════════════
    //  CHAT
    // ════════════════════════════════════════════════════════
    function sendMsg() {
      const text = chatDraft.value.trim();
      if (!text) return;
      if (connStatus.value !== 'connected') { toast(t('connectionHelp')); return; }

      const payload = {
        user:   nickname.value,
        text,
        ts:     Date.now(),
        isHost: isHost.value,
      };

      // Optimistic local append
      pushMsg({
        id:     uid(),
        type:   'chat',
        author: payload.user,
        body:   payload.text,
        time:   hhMm(payload.ts),
        isHost: payload.isHost,
      });

      // Broadcast to peers
      emit('chat_message', payload);
      chatDraft.value = '';
    }

    function pushMsg(m) {
      messages.value.push(m);
      nextTick(() => {
        if (msgArea.value) msgArea.value.scrollTop = msgArea.value.scrollHeight;
      });
    }

    function sysMsg(text) {
      pushMsg({ id: uid(), type: 'system', body: text });
    }

    // ════════════════════════════════════════════════════════
    //  EMOJI REACTIONS
    // ════════════════════════════════════════════════════════
    function react(emoji) {
      // Immediate local spawn
      spawnEmoji(emoji);
      // Broadcast to peers
      emit('emoji_reaction', { emoji, user: nickname.value });
    }

    function spawnEmoji(char) {
      const w   = videoWrapper.value?.clientWidth ?? 400;
      const x   = Math.floor(Math.random() * (w - 50)) + 10;
      const id  = uid();
      floaters.value.push({ id, char, x });
      setTimeout(() => {
        const i = floaters.value.findIndex(f => f.id === id);
        if (i !== -1) floaters.value.splice(i, 1);
      }, 2300); // slightly longer than animation duration
    }

    // ════════════════════════════════════════════════════════
    //  HOST MANAGEMENT
    // ════════════════════════════════════════════════════════
    async function claimHost() {
      if (connStatus.value !== 'connected' || hasLeft.value) return;
      hostSince = Date.now();
      isHost.value = true;
      preferences.set(`sahra_host_${roomId.value}`, '1', true);
      sysMsg(`${nickname.value} claimed host controls`);
      toast('You are now the Host — your playback controls all viewers');

      // Tell every other participant (including any previous host) to step down.
      // They receive host_takeover → set isHost=false → re-track presence.
      // This guarantees exactly ONE host badge is shown at any time.
      emit('host_takeover', { newHost: nickname.value, participantId, hostSince });

      // Update our own presence so the sidebar shows HOST badge for us
      if (channel) {
        await channel.track(presenceProfile());
      }

      // Announce in chat
      emit('chat_message', {
        user:   '⚡ Room',
        text:   `${nickname.value} is now the Host`,
        ts:     Date.now(),
        isHost: false,
      });
    }

    // ════════════════════════════════════════════════════════
    //  LEAVE / REJOIN / NEW PARTY
    // ════════════════════════════════════════════════════════

    /**
     * Confirmed leave: untrack presence, tear down channel,
     * clear host session flag, and show the left-party screen.
     */
    async function leaveParty() {
      showExitConfirm.value = false;

      // Stop all media so audio doesn't keep playing under the left-party screen
      if (vjsPlayer) { vjsPlayer.pause(); vjsPlayer.src(''); }
      if (ytPlayer && typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
      videoSrc.value  = '';
      ytVideoId.value = '';
      iframeSrc.value = '';

      // Announce departure in chat before disconnecting
      emit('chat_message', {
        user:   '👋 Room',
        text:   `${nickname.value} left the party`,
        ts:     Date.now(),
        isHost: false,
      });

      // Small delay so the broadcast goes out before teardown
      await new Promise(r => setTimeout(r, 180));
      await teardown();
      isHost.value = false;
      wasInUrl.value = true;

      // Clear host claim so a future visitor can become host
      preferences.remove(`sahra_host_${roomId.value}`, true);

      hasLeft.value = true;
    }

    /**
     * Rejoin the same room — clears the left screen and
     * re-runs the boot sequence without reloading the page.
     */
    async function rejoinParty() {
      hasLeft.value = false;
      // Re-run boot (will re-subscribe to channel, re-track presence)
      await boot();
    }

    /**
     * Discard current room, generate a fresh one, and reload.
     * We use a full page reload so all state is cleanly reset.
     */
    function startNewParty() {
      const newId = makeRoomId();
      preferences.set(`sahra_host_${newId}`, '1', true);
      const u = new URL(window.location.href);
      u.searchParams.set('room', newId);
      window.location.href = u.toString(); // full reload → clean slate
    }

    // ════════════════════════════════════════════════════════
    //  ROOM LINK
    // ════════════════════════════════════════════════════════
    async function copyLink() {
      try {
        await navigator.clipboard.writeText(fullRoomUrl.value);
        linkCopied.value = true;
        setTimeout(() => { linkCopied.value = false; }, 2200);
        toast('Room link copied!');
      } catch {
        toast('Could not copy — please copy manually from the field');
      }
    }

    // ════════════════════════════════════════════════════════
    //  TOASTS
    // ════════════════════════════════════════════════════════
    let tid = 0;
    function toast(msg, ms = 3200) {
      const id = ++tid;
      toasts.value.push({ id, msg });
      setTimeout(() => {
        const i = toasts.value.findIndex(t => t.id === id);
        if (i !== -1) toasts.value.splice(i, 1);
      }, ms);
    }

    // ════════════════════════════════════════════════════════
    //  SUPABASE EMIT HELPER
    // ════════════════════════════════════════════════════════
    function emit(event, payload) {
      if (!channel || isDemoMode()) return;
      channel.send({ type: 'broadcast', event, payload }).catch(console.error);
    }

    // ════════════════════════════════════════════════════════
    //  TEMPLATE BINDINGS
    // ════════════════════════════════════════════════════════
    return {
      // Language / i18n
      lang, isRTL, t, toggleLang, msgDir,
      // Subtitles (Video.js)
      subtitleUrl, subtitleLang, activeCcLabel, addSubtitleTrack, clearSubtitles,
      subtitleFileRef, handleSubtitleFile,
      localFileRef, handleLocalFile,
      // Sync
      broadcastCurrentState,
      // Live TV
      TV_CHANNELS, showChannelPicker, activeChannel, loadChannel,
      _currentTvChannelRef, activeServerIndex, serverRetrying, switchServer, tryNextServer,
      // Room & identity
      roomId, nickname, isHost, fullRoomUrl, EMOJIS, participantId,
      saveProfile, editName, cancelNameEdit, mediaError, reconnect,
      controlsDialog, showControls, openControls, closeControls, onControlsBackdrop, accountMenu, closeAccount,
      // Modal (landing / create / joinCode / join)
      showModal, wasInUrl, nameInput, nameInputRef, confirmName,
      modalMode, joinCodeInput, joinCodeRef,
      chooseModeCreate, chooseModeJoin, confirmJoinCode,
      // Connection
      connStatus,
      // Video — native, YouTube, and iframe embed
      videoEl, videoWrapper, videoSrc, urlInput, videoTitle, syncPulse,
      videoType, ytVideoId, iframeSrc, showIframeNotice, iframeNoticeHtml,
      showCountdown, countdownNum,
      syncTimeInput, broadcastSyncPoint,
      needsUnmute, unmutePeer,
      onPlay, onPause, onSeeked, loadVideo, forceSyncPeers,
      // Participants
      onlineUsers, colorOf,
      // Chat
      messages, chatDraft, msgArea, sendMsg,
      // Emoji
      floaters, react,
      // UI / toasts
      linkCopied, toasts, copyLink, claimHost,
      // Leave / exit
      showExitConfirm, hasLeft, leaveParty, rejoinParty, startNewParty,
    };
  }
}).mount('#app');
