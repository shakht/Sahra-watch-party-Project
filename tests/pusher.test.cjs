const test = require('node:test');
const assert = require('node:assert/strict');
const {createHmac} = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');

test('Pusher authorizer signs only Sahra room subscriptions', async () => {
  const {handle} = await import('../supabase/functions/pusher-auth/index.ts');
  const request = channel => new Request('https://example.test', {method:'POST', body:new URLSearchParams({socket_id:'123.456',channel_name:channel})});
  const env = key => key === 'PUSHER_KEY' ? 'public' : 'test-secret';
  const r = await handle(request('private-sahra-ABC123'),env);
  assert.equal((await r.json()).auth,'public:'+createHmac('sha256','test-secret').update('123.456:private-sahra-ABC123').digest('hex'));
  assert.equal((await handle(request('private-admin'),env)).status,400);
  assert.equal((await handle(request('private-sahra-ABC123'),()=>undefined)).status,503);
});

test('Pusher adapter waits for subscription, caps bursts, recovers and cleans up', () => {
  const bindings = {}, connections = {}, sent = []; let closed=false, ready=0, received=0;
  const channel={bind:(e,cb)=>bindings[e]=cb,trigger:(e,p)=>sent.push([e,p]),unbind_all:()=>{}};
  const window={Pusher:class {connection={bind:(e,cb)=>connections[e]=cb};subscribe(){return channel;}disconnect(){closed=true;}}};
  vm.runInNewContext(fs.readFileSync('assets/pusher-sync.js','utf8'),{window,Date});
  const sync=new window.SahraPusherSync({key:'key',cluster:'eu',room:'ABC123',receive:()=>received++,ready:()=>ready++});
  sync.send('playback_control',{});assert.equal(sent.length,0);
  bindings['pusher:subscription_succeeded']();assert.equal(ready,1);
  for(let i=0;i<12;i++)sync.send('playback_control',{});
  assert.equal(sent.length,8);
  bindings['client-playback_control']({});assert.equal(received,1);
  connections.state_change({current:'disconnected'});assert.equal(sync.ready,false);
  bindings['pusher:subscription_succeeded']();assert.equal(sync.ready,true);
  sync.close();assert.equal(closed,true);assert.equal(sync.ready,false);
});
