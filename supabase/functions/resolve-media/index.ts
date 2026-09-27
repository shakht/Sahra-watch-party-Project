// Only resolves public Albox metadata. Never proxies movie bytes or arbitrary URLs.
const origins = new Set(['https://shakht.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173']);
export function mediaUrl(value: unknown, extension: string) {
  if (typeof value !== 'string') return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /^cloud\d+\.albox\.co$/.test(u.hostname) &&
      !u.username && !u.password && !u.port && u.pathname.endsWith(extension);
  } catch { return false; }
}

export async function handle(req: Request, request = fetch) {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://shakht.github.io',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !origins.has(origin)) return reply(403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  let id;
  try {
    const text = await req.text();
    if (text.length > 2048) return reply(413, { error: 'Request too large' });
    const u = new URL(JSON.parse(text).url);
    if (u.origin !== 'https://cinema.albox.co' || u.username || u.password) throw Error();
    id = u.pathname.match(/^\/show\/play\/(\d{1,12})\/?$/)?.[1];
    if (!id) throw Error();
  } catch { return reply(400, { error: 'Paste an Albox movie playback page URL.' }); }
  try {
    const response = await request(`https://cinema.albox.co/api/v4/shows/episodes/${id}/files`,
      { redirect: 'error', signal: AbortSignal.timeout(12000), headers: { Accept: 'application/json' } });
    if (!response.ok) return reply(502, { error: `Albox rejected the server request (HTTP ${response.status}).`, code: 'UPSTREAM_REJECTED', upstreamStatus: response.status });
    const data = await response.json();
    const videos = (Array.isArray(data.videos) ? data.videos : []).slice(0,10)
      .filter((v: any) => mediaUrl(v.url, '.mp4')).map((v: any) => ({ url: v.url, quality: String(v.quality || 'Video').slice(0,20) }));
    const subtitles = (Array.isArray(data.subtitles) ? data.subtitles : []).slice(0,20)
      .filter((s: any) => mediaUrl(s.vtt, '.vtt')).map((s: any) => ({ url: s.vtt, language: String(s.language || 'ar').slice(0,10) }));
    if (!videos.length) return reply(422, { error: 'No supported video found for this page.' });
    return reply(200, { title: String(data.show_title || 'Albox movie').slice(0,200), videos, subtitles });
  } catch { return reply(502, { error: 'Albox is unavailable from this server. Try again later.' }); }
}

if (import.meta.main && typeof Deno !== 'undefined') Deno.serve(req => handle(req));
