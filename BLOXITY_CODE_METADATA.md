---
game: Keysprint
slug: keysprint
canDie: true
hasScore: true
multiplayer: true
hostedOnBoxity: true
roomSize: 16
gameplayAds: false
inAppPurchases: false
---

# Keysprint: Boxity integration notes

The answers below (2026-11-19) are the same ones the developer gave for Lockdown Escape, the game Keysprint is forked from (the same
genre, the same systems). Change any of them here, and in the code, if this game should differ.

- **canDie: true.** On the Sprintway (a narrow keyboard path climbing into the sky) giant balls roll down from the top, one every
  6.5 seconds. A ball that rolls over a player knocks them out: anywhere on the path, or in the middle of a wide keyboard (in the
  balls' line). Out on the side of a safe keyboard the balls roll by. The player's screen calls it first; the server also checks
  every move against the balls on its own clock and knocks out a player whose screen didn't.

  That opens `Legion.SDK.deathScreen.show()` and the game's own death card in the centre of the screen (`#revive` in
  `client/index.html`, `reviveShow` in `client/src/ui.js`). The card has three buttons:
  - **REVIVE at Stage N.** FREE once every 3 minutes, else 5 Gems.
  - **▶ WATCH AD.** A rewarded ad (`revive`) for a FREE revive, shown only while `ads.isAvailable()`.
  - **BACK TO Home Row.**

  Every button stays greyed out under Boxity's countdown, and respawns only when `death.respawn()` returns true. Nothing respawns the
  player on a timer. The server keeps the revive on offer for 120 s while the card is up; after that only BACK TO Home Row is left.
  A race start, a rebirth or a world switch while knocked out calls `deathScreen.hide()`.
  Boxity's "Reset Character" (`respawn_request`) still sends a living player straight back to Home Row.
  Ball Rush (the race) has no knock-out: a ball that hits a racer knocks them back to the pocket behind them, and the race goes on.
- **hasScore: true.** Six boards, declared in `shared/config.js` (`LEADERBOARDS`). The client calls `leaderboard.define()` right after
  init. The server reports scores from server-owned state (`server/src/bloxity.js` `queueScore`, `server/src/RunRoom.js`) and batches
  them every 15 s.

  | id | label | order | mode | format | reset |
  |---|---|---|---|---|---|
  | `wins` | Wins | desc | sum | compact | weekly |
  | `speed` | Top Speed | desc | best | compact | none |
  | `clicks` | Clicks | desc | sum | compact | weekly |
  | `stage` | Highest Stage | desc | best | number | weekly |
  | `rebirths` | Rebirths | desc | best | number | none |
  | `races` | Races Won | desc | sum | number | weekly |

  When each one is reported:
  - `wins`: every Win as it's earned.
  - `speed`: once a second, only when the player's top Speed has gone up.
  - `clicks`: every click the server counts (they come in batches of up to 40).
  - `stage`: when a checkpoint is reached further than ever before, counted across the worlds (Stage 1 of Pastel Peaks is 16).
  - `rebirths`: the player's rebirth count, at every rebirth.
  - `races`: +1 for every race won.

  Only `legion_` identities are reported. The Leaderboards panel's button opens Boxity's panel (`leaderboard.open('wins')`).
- **Gameplay banners: off.** The screens declared:
  - `panel`: Shop, Pets, Upgrades, Quests, Daily, Wheel, Rebirth, Teleport, Leaderboards, Gifts, Settings, Stats.
  - `lobby`: Ball Rush's start line.
  - `results`: the race results.
  - `gameplay`: declared with no banners.

  There is no start menu: the player lands straight on Home Row.
- **No in-app purchases.** Everything costs Wins or Gems earned in the game, so there is no Gems purchase and no webhook.
- **Rewarded ads:** `revive` (a FREE revive on the death card), `skip-stage` (FREE SKIP of the stage you're in), `x2-speed`
  (x2 Speed for 10 minutes). Each is offered only while `ads.isAvailable()`. The server checks every token with
  `POST {BLOXITY_API_URL}/v1/ads/reward/verify` before granting anything (`onAdRevive`, `onAdSkip`, `onAdX2`).

Where things live:

- **Client SDK wrapper:** `client/src/bloxity.js` (`GAME_SLUG = 'keysprint'`). It holds:
  - the only `onUserChanged` subscription;
  - the environment helper `env()`;
  - avatar slots, the character kit and custom characters;
  - chat, ads, the death screen, leaderboards and settings.
- **Avatars:** `client/src/avatar.js`. It draws every slot from `avatar.getAccessorySlots()`, uses the platform character kit when
  `character.canDress` is true, loads custom characters from `avatar.getCharacterFor`, and takes skins from
  `avatar.getSkinTextureUrlFor`.
- **Server:** `server/src/bloxity.js` handles:
  - identity: `POST /v1/auth/game-token/verify`, with `carriedFrom` guest progress;
  - rewarded-ad verification;
  - the leaderboards report;
  - profile stats.

  Guest progress adoption is in `server/src/profiles.js` (`adoptGuestProgress`). Open Rooms come from
  `server/src/legion-room-reporter.js` (`installRoomReporter()` after `listen`).
- **Matchmaking:** `client/src/main.js` `serverEndpoint()` resolves a pod with `Legion.SDK.net.resolveEndpoint('keysprint')` on every
  connect. It builds a new Client each time and retries with a backoff for up to a minute. No socket ever opens to
  `keysprint.host.bloxity.io`. A `?roomId=` joins that room through its pod's relay first (`{playUrl}/v1/dir/keysprint/list`), else
  normal matchmaking.
- **Chat:** with Boxity chat, each player's latest line shows over their head, found by their Boxity id (`PlayerState.bx`).
- **Emotes:** `game.registerFeature('emotes')` runs right after init. `play_emote` plays on your avatar and is relayed to the room.
- **Ad breaks:** `ads.onBreakStart` stops the frame loop and suspends the audio; `onBreakEnd` resumes both.
