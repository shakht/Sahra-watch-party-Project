// Runs on the Albox playback page, using the viewer's own network.
(async () => {
  if (location.origin !== 'https://cinema.albox.co' || !/^\/show\/play\/\d+\/?$/.test(location.pathname)) {
    alert('Open an Albox movie playback page first, then run Send to Sahra.'); return;
  }
  try {
    const id = location.pathname.match(/\d+/)[0];
    const response = await fetch('/api/v4/shows/episodes/' + id + '/files', {
      credentials: 'omit', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw Error('Albox returned HTTP ' + response.status);
    const data = await response.json();
    const packet = 'SAHRA1:' + JSON.stringify({
      title: data.show_title, videos: data.videos,
      subtitles: (data.subtitles || []).map(s => ({ url: s.vtt, language: s.language }))
    });
    if (packet.length > 24000) throw Error('Movie details are too large to import.');
    // A user gesture on this button permits mobile clipboard access after fetch.
    const panel = document.createElement('dialog');
    panel.style.cssText = 'max-width:420px;width:85%;padding:24px;border:0;border-radius:12px;background:#171717;color:white;font:16px system-ui';
    const heading = document.createElement('h2'); heading.textContent = 'Send to Sahra';
    const instructions = document.createElement('p');
    instructions.textContent = 'Copy these movie details, then paste them into Video link in your Sahra room and press Load.';
    const value = document.createElement('textarea'); value.value = packet;
    value.readOnly = true; value.style.cssText = 'width:100%;height:80px';
    const copy = document.createElement('button'); copy.textContent = 'Copy movie details';
    copy.onclick = async () => {
      try { await navigator.clipboard.writeText(packet); copy.textContent = 'Copied — return to Sahra'; }
      catch { value.focus(); value.select(); instructions.textContent = 'Copy the selected text manually, then paste it into Sahra.'; }
    };
    const close = document.createElement('button'); close.textContent = 'Close'; close.onclick = () => panel.remove();
    panel.append(heading, instructions, value, copy, close); document.body.append(panel); panel.showModal();
  } catch (error) { alert('Send to Sahra: ' + error.message); }
})();
