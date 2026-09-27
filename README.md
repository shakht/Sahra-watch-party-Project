# سَهرة · Sahra

A bilingual Arabic/English watch-party app: create a room, share its link, and watch with friends using synchronized playback, chat, and reactions.

## Run locally

With Node.js installed, run `npm start`, then open http://127.0.0.1:4173.
No npm dependencies or build step are required. Vue, Supabase, and Video.js load from CDNs, so an internet connection is required.

Run `npm test` for the room/profile regression tests and `npm run check` for JavaScript syntax validation.

## Files and hosting

- `index.html`: interface templates and CDN dependencies.
- `assets/styles.css`: desktop, mobile, and RTL styling.
- `assets/app.js`: profiles, rooms, player controls, translations, and Supabase Realtime.
- `tests/app.test.cjs`: Node tests using an isolated browser/Supabase simulation.

GitHub Pages can serve these files directly. Publish `index.html` **and the `assets` directory** together to the configured Pages branch/folder. The relative asset paths work under `/Sahra-watch-party-Project/`. The Node development server is not required on GitHub Pages.

## Profiles and rooms

First-time visitors choose a name before creating or joining a room. The name is stored in this browser's `localStorage` as `sahra_nick`, including names saved by the previous version. Returning visitors skip this step. Use **Change name** on the welcome screen or in the room; connected participants receive the new name through Presence. Storage is per browser and site, not a cross-device account; clearing site data removes it. If browser storage is blocked, the app still works for the current visit.

Each connection has a unique participant ID so friends with identical names remain separate. Host claims use a timestamp and participant-ID tie-breaker to reconcile simultaneous claims and reconnects. Hosts send a state refresh every ten seconds; viewers request current state after reconnecting. This is cooperative client-side host management, not server-enforced access control. Anyone with a room link can join and claim host.

## Watching and chatting

On mobile, the header and video stay above the conversation, and the message composer stays at the bottom. Only the message history scrolls. The layout adapts to the visual viewport when the software keyboard opens; a physical-device keyboard check is still recommended before release.

Use **Controls** to open video sources, subtitles, playback sync, and invitation links. It appears as a bottom sheet on phones and a side panel on desktop. Escape and the close button dismiss it; loading a source returns you to the video. The profile menu contains name editing, language, and leaving the room. Open the participant count next to **Room chat** to see the room roster.

The design uses a compact header, warm neutral surfaces, a consistent spacing scale, visible keyboard focus, and labeled controls. References: [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), [Apple TV](https://tv.apple.com/), and [MUBI](https://mubi.com/).

## Media limitations

- Direct HTTPS video/HLS links and supported YouTube videos support automatic synchronization. The media source must allow playback in the browser and embedding/CORS where required.
- Local files are not uploaded or shared. Everyone must select the same file independently.
- Other streaming pages may refuse embedding. Embedded pages use manual timestamps/countdowns because their players cannot be controlled across origins.
- Supabase must be active and reachable for chat, presence, and synchronization. The app shows connection status and provides a reconnect button. A static page cannot keep a paused backend awake when nobody has the page open.
- The frontend Supabase key must be a public anon/publishable key, never a service-role key. Room broadcasts and chat are ephemeral; this app does not store chat history.

## Verification

The automated tests cover name persistence/edit/cancel, blocked storage, duplicate names, room creation, reconnect state requests, host reconciliation, local-file URL isolation, and invalid inputs. They simulate Realtime and do not prove live multi-device playback. Before publishing, test two browsers against an active Supabase project, including play/pause/seek and reconnect.
