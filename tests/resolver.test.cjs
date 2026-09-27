const test = require('node:test');
const assert = require('node:assert/strict');
const handler = import('../supabase/functions/resolve-media/index.ts');
const req = url => new Request('https://example.test', {method:'POST',headers:{Origin:'https://shakht.github.io'},body:JSON.stringify({url})});
test('resolver rejects arbitrary hosts and credential URLs without outbound requests', async()=>{
 const {handle}=await handler;
 for(const url of ['https://localhost/show/play/1','https://cinema.albox.co.evil.test/show/play/1','https://user@cinema.albox.co/show/play/1','https://cinema.albox.co/other']) {
  const r=await handle(req(url),()=>{throw Error('Should not fetch')}); assert.equal(r.status,400);
 }
});
test('resolver returns only validated media and subtitle URLs',async()=>{
 const {handle}=await handler;
 const r=await handle(req('https://cinema.albox.co/show/play/1071678'),async(url,options)=>{
  assert.equal(url,'https://cinema.albox.co/api/v4/shows/episodes/1071678/files');assert.equal(options.redirect,'error');
  return Response.json({show_title:'Movie',videos:[{url:'https://cloud02.albox.co/episodes/movie.mp4',quality:'720p'},{url:'http://localhost/movie.mp4'}],subtitles:[{vtt:'https://cloud02.albox.co/episodes/sub.vtt',language:'ar'}]});
 });
 const data=await r.json();assert.equal(data.videos.length,1);assert.equal(data.subtitles[0].language,'ar');assert.equal(r.headers.get('access-control-allow-origin'),'https://shakht.github.io');
});
test('resolver handles upstream errors and preflight',async()=>{
 const {handle}=await handler;
 assert.equal((await handle(req('https://cinema.albox.co/show/play/1'),async()=>new Response('',{status:403}))).status,502);
 assert.equal((await handle(new Request('https://example.test',{method:'OPTIONS',headers:{Origin:'https://shakht.github.io'}}))).status,204);
});
