// Optional second delivery path. Supabase remains active for mixed-version rooms.
window.SahraPusherSync = class {
  constructor({ key, cluster, endpoint, headers, room, receive, ready }) {
    this.handlers = receive;
    this.times = [];
    this.ready = false;
    if (!key || !cluster || !window.Pusher) return;
    try {
      this.client = new window.Pusher(key, { cluster, forceTLS: true,
        channelAuthorization: { endpoint, transport: 'ajax', headers } });
      this.channel = this.client.subscribe('private-sahra-' + room);
      this.channel.bind('pusher:subscription_succeeded', () => { this.ready = true; ready(); });
      this.channel.bind('pusher:subscription_error', () => { this.ready = false; });
      this.client.connection.bind('state_change', state => {
        if (state.current !== 'connected') this.ready = false;
      });
      for (const event of ['playback_control', 'playback_request', 'sync_ping', 'sync_pong']) {
        this.channel.bind('client-' + event, payload => receive(event, payload));
      }
    } catch { this.close(); }
  }
  send(event, payload) {
    if (!this.ready) return;
    const now = Date.now();
    this.times = this.times.filter(time => now - time < 1000);
    // Pusher allows 10 client events/sec. Leave headroom; Supabase delivers overflow.
    if (this.times.length >= 8) return;
    this.times.push(now);
    try { this.channel.trigger('client-' + event, payload); } catch { /* Supabase copy remains active. */ }
  }
  close() {
    this.ready = false;
    this.channel?.unbind_all();
    this.client?.disconnect();
  }
};
