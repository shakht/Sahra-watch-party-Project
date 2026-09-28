# Activate Pusher playback delivery

1. Create a Pusher **Channels** app and enable **Client Events** in its settings.
2. Put its public key and cluster in `assets/pusher-config.js`.
3. In Supabase Edge Function secrets, enter `PUSHER_KEY` and `PUSHER_SECRET`. Never commit the secret or put it in frontend code.
4. Deploy `pusher-auth` with JWT verification enabled:

```sh
supabase functions deploy pusher-auth --project-ref wmbxqwciyynyzqirgive
```

5. Publish the frontend and test a host and friend on separate devices.

Playback controls, viewer requests, and clock probes travel through both transports using the same message ID. The first copy wins. Supabase continues delivering source metadata, chat, presence and overflow events. Pusher failures do not disable the Supabase path. Blank configuration leaves Pusher inactive.

The authorizer retains the existing guest room model: anyone knowing a room code can subscribe. A private Pusher channel here is not account-based authorization. Client events cannot enforce a trusted host against a malicious participant. Monitor message and connection quotas; duplicate delivery increases usage and does not guarantee lower latency.

Validation before claiming improvement: confirm subscriptions succeed, test play/pause and seeking on both devices, compare drift, then disconnect Pusher and confirm Supabase still synchronizes. No live Pusher performance claim is supported until credentials are configured and this test passes.

References: https://pusher.com/docs/channels/using_channels/events/ and https://pusher.com/docs/channels/server_api/authorizing-users/
