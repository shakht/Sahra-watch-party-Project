fetch('./assets/albox-bookmarklet.js').then(r => { if (!r.ok) throw Error(); return r.text(); }).then(code => {
  const url = 'javascript:' + encodeURIComponent(code);
  document.querySelector('#bookmark').href = url;
  document.querySelector('#code').value = url;
  document.querySelector('#copy').onclick = async () => {
    try { await navigator.clipboard.writeText(url); document.querySelector('#status').textContent = 'Copied. Paste into the bookmark URL field.'; }
    catch { document.querySelector('#code').select(); document.querySelector('#status').textContent = 'Copy the selected code manually.'; }
  };
}).catch(() => { document.querySelector('#status').textContent = 'Could not load the helper. Reload this page.'; });
