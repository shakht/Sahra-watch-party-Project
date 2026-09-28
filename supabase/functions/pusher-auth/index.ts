// Rooms retain Sahra's existing guest model: anyone with the room code can join.
// Gateway JWT verification is required. Never expose PUSHER_SECRET to browsers.
export async function handle(req: Request, env = (name: string) => Deno.env.get(name)) {
  const origin = req.headers.get('origin') || '';
  const allowed = ['https://shakht.github.io', 'http://127.0.0.1:4173', 'http://localhost:4173'];
  const headers = { 'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Content-Type': 'application/json',
    'Cache-Control': 'no-store' };
  const reply = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers });
  if (origin && !allowed.includes(origin)) return reply(403, { error: 'Origin not allowed' });
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const body = await req.text();
  if (body.length > 1024) return reply(413, { error: 'Request too large' });
  const params = new URLSearchParams(body);
  const socket = params.get('socket_id') || '';
  const channel = params.get('channel_name') || '';
  if (!/^\d{1,20}\.\d{1,20}$/.test(socket) || !/^private-sahra-[A-Z0-9]{6}$/.test(channel)) {
    return reply(400, { error: 'Invalid room subscription' });
  }
  const key = env('PUSHER_KEY'), secret = env('PUSHER_SECRET');
  if (!key || !secret) return reply(503, { error: 'Pusher is not configured' });
  const encoder = new TextEncoder();
  const signingKey = await crypto.subtle.importKey('raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', signingKey, encoder.encode(socket + ':' + channel));
  const hex = [...new Uint8Array(signature)].map(b => b.toString(16).padStart(2, '0')).join('');
  return reply(200, { auth: key + ':' + hex });
}
if (import.meta.main && typeof Deno !== 'undefined') Deno.serve(req => handle(req));
