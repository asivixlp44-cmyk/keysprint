# Keysprint

A multiplayer "+1 Speed" clicker runner for the browser, built with **Three.js** and **Colyseus** for Bloxity. It is listed as **+1 Speed Keysprint Clicker ⚡**, slug `keysprint`.

Giant keyboards float over a sea of clouds.

- **Click for Speed.** Every click is **+1 Speed, times all your boosts**. Click with the big **CLICK!** button, **E**, a click or tap on the world, or a controller's B. **Auto Click** clicks for you, and every 20th click is a **MEGA** click worth x10.
- **Speed is how fast you run.** The more Speed you have, the faster you sprint.
- **Home Row.** You start here, on a giant keyboard. Stand on its **Power Keys** ("+2 / CLICK" ... "+60 / CLICK") and every click is worth more. The Wins you earn open better keys.
- **The Sprintway: a ball run.** A narrow keyboard path climbs into the sky, and **giant balls of keycaps roll down it** from a chute at the top, one after another.
  - Wide keyboards cross the path now and then. Stand out on the **side** of one and a ball rolls right past you.
  - The moment it has gone by, **RUN** up the path to the next one before the next ball gets there.
  - Fifteen stages per world. Each starts on a checkpoint keyboard and has two safe keyboards on the way. The runs get longer and the balls faster the higher you climb, so the further up, the more Speed it takes.
- **Knocked out.** A ball that rolls over you knocks you out and Boxity's death screen counts down. Then **REVIVE** straight back into the stage (FREE every 3 minutes, for a short ad, or 5 Gems), or go **BACK TO Home Row**.
- **Wins.** Every checkpoint you reach pays Wins. Spend them on upgrades, trails and Eggs for keyboard pets.
- **Rebirth and worlds.** Rebirth for a multiplier that stays. Reach a world's finish to open the next.
- **Ball Rush.** Press **RACE** to race five others up six lanes with balls rolling down every one. Duck into the pockets, and be first to the portal.

**Reference.** The genre, the core loop and the feel of the numbers follow the Roblox game *+1 Speed Keyboard Clicker*, studied from its page and the developer's screenshots:
- a big Click button, Auto Click and "+1 per click";
- a bar under the Speed counter, a Spin wheel, Free Gifts;
- Pets, Trails, Rebirth, Boosts and Teleport buttons, Eggs, leaderboards;
- the gameplay: a narrow keyboard path climbing into the sky, giant balls rolling down it from the top, wide keyboards crossing it where you step aside and wait for a ball to pass, Wins along the way.

**Our own.** Everything players see and hear, per the house rules in `NEW_GAME_PROMPT.md`:
- the name, the keyboards-in-the-sky setting, the four worlds and their sixty stages;
- the balls (balls of keycaps in each world's colours), the chute and the drain, the checkpoints, the Power Keys, Home Row, Ball Rush;
- the pets and eggs, the HUD and its art, the icons, the text, the sounds and the music.

Nothing of the reference's art, characters or text is used.

**There are no in-app purchases.** Everything costs Wins or Gems earned in the game. Three things can also be had for a rewarded ad: a revive, a skip, x2 Speed. No Bux are spent anywhere.

It is forked from Lockdown Escape (the newest Legion game), for its engine only:
- the server and its race queue with bot takeover;
- the camera and lighting rig, the quality system;
- profiles, saves and play stats;
- the test suite;
- the whole Bloxity integration, described in `BLOXITY_CODE_METADATA.md` and below.

What you play is new:
- **The loop.** Clicking gives Speed (not running), and the server counts every click.
- **The course.** Lockdown's obstacle stages (and the monster that chased you) are gone. In their place is the ball run, with the balls on the server's clock so everyone sees the same ones.
- **The race.** Ball Rush is lanes of rolling balls and pockets, not a wall chasing you.
- **The look.** Keyboards floating over the clouds.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client. See the file list below. |
| `server/` | Colyseus 0.18 server. See the file list below. |
| `shared/` | `config.js`: the click economy, the Speed curve, worlds, Power Keys, pets, quests, codes and the six `LEADERBOARDS`. `stages.js`: the Ball Run's sizes and the balls' tempo. `world.js`: where everything stands, the balls' timetable, the hit test, and `runClear` (is the way to the next keyboard clear?). `arena.js`: a race's lanes, pockets and balls. `physics.js`. |
| `tests/` | Server, economy and browser test scripts, the cover renderer, the setup-page generator. |
| `tools/` | `local-port.mjs`: the port picker `start-local.bat` uses. |

The client's files:

| File | What it holds |
|---|---|
| `main.js` | Boot, clicking (prediction, Auto Click, MEGA), your runner, the balls (hits, rumble, the warning glow, GO!), the death screen, the network (Boxity matchmaker, `?roomId=`), races, the autopilot, the camera, input |
| `world.js` | Home Row, the Power Keys, and the Sprintway (the path, the wide keyboards, the drain, the chute) |
| `stagefx.js` | The giant balls (one instanced draw), and the one on its stand on Home Row |
| `arenaview.js` | Ball Rush: the lanes, their pockets, the grate, the balls |
| `engine.js` | The renderer, the light rig, each world's sky and the cloud sea |
| `keycaps.js` | The instanced keycap floor |
| `bloxity.js` | Every Boxity SDK call |
| `avatar.js`, `chars.js` | Bloxity avatars, the character kit, custom characters, name tags with ⚡ Speed |
| `pals.js` | The pets |
| `ui.js`, `index.html` | The HUD (the click row, the Speed bar), the panels, the death card |
| `icons.js` | The drawn HUD icons, pets and eggs |
| `asmr.js` | The key clacks and effects, synthesised in a worker |
| `audio.js` | The mixer and both songs |

The server's files:

| File | What it holds |
|---|---|
| `RunRoom.js` | The `run` room: clicks and their guard; its own look at the balls on every move; checkpoints and Wins; knock-outs and revives (FREE, Gems, a verified rewarded ad); skips, purchases, rebirths, worlds, tasks, quests, rewards, codes; bots that dodge the balls |
| `Match.js` | Ball Rush: the queue, the balls in every lane and their knock-backs, bots |
| `bloxity.js` | Token verify with `carriedFrom`, rewarded-ad verify, the leaderboards report, profile stats |
| `legion-room-reporter.js` | Open Rooms |
| `profiles.js` | Profiles in MongoDB on Legion, guest progress adoption |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat` (it picks port 3205, or the next free one up to 3211). Or run:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3205
```

For development:
- Run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5733.
- The dev server injects `window.BLOXITY_ENV = { env: 'local', ... }` before the game's code (`client/vite.config.js`, serve only). A production build is told nothing; Boxity tells it where it runs.
- Dev builds, or a build with `VITE_QA=1`, expose `window.__qa`. `QA=1` on the server lets the client give itself Speed, Wins and so on; it is refused on Legion.

## Gameplay

- **Clicks.**
  - Click with **CLICK!** (bottom middle), **E**, a left-click or tap on the world (not a drag), or B / RB on a controller.
  - **AUTO** (beside CLICK!) is **Auto Click**: 3 clicks a second, +0.5 for each level of Auto Clicker Pro. It's free, it keeps clicking while you run, and **it starts ON** for a first visit (turn it off with the button and that sticks on this device). It also clicks in a tab that's in the background, once a second, so an AFK player still grows.
  - Every click is **+1 Speed times all your boosts**:
    - rebirths (x1.5, x2 ...), pets, your trail and aura;
    - Clicky Switches (+15% a level), the world you're in (x1, x4, x16, x64);
    - x2 Speed and the squad boost.
  - Standing on a **Power Key** multiplies it again: "+2 / CLICK" means twice as much.
  - **MEGA click:** every 20th click is worth x10 (Mega Keys bring it down to every 10th).
  - The Speed bar shows what a click gives now ("+3 / CLICK") and how far you are to the next stage's Recommended Speed ("STAGE 3 AT 90"). STATS lists every boost.
  - The server counts every click: at most 16 a second (a burst of 32 is allowed), only on a Power Key you're really standing on, never in a race or while knocked out. The client shows each click at once and squares up with the server's count.
- **Speed is your running speed.**
  - 16 studs a second at 0 Speed. Each stage's **Recommended Speed** (20, 90, 300, 800, 2K, 5K, 11K, 22K, 40K, 70K, 120K, 200K, 350K, 600K) runs at that stage's pace, up to 92.
  - "⚡ Fast enough for Stage N!" tells you when you get there.
  - The **CUSTOM SPEED** card lets you run slower.
- **Power Keys on Home Row.** They open with the Wins you've earned in all:
  - Esc +1, Tab +2 (10 Wins), Shift +3 (60), Caps +5 (300), Enter +8 (1,500), Space +12 (25,000), Turbo +20 (1,000,000);
  - Golden +35 (120 Gems) and RGB +60 (400 Gems).

  A key goes down under you with every click. **Train** (in the menu buttons) walks you to your best one.
- **The Sprintway (the ball run).**
  - **The path.** A narrow path of giant keys (15 studs wide) climbs from the Sprintway's gate into the sky between low bezels. It is flat on the wide keyboards and rises on every run between them, about 156 studs in all.
  - **The balls.** Giant balls of keycaps (16 studs across) leave the **ball chute** at the top every 6.5 seconds and roll all the way down the path to the **ball drain** on the first checkpoint, where they drop away.
    - A ball rolls at its stage's ball speed: 43 studs a second at the bottom, up to 92 at the top.
    - Everything runs on the server's clock, so every player sees the same balls in the same places.
  - **The wide keyboards** cross the path, 60 studs wide. Out past the glowing line on either side, a ball can't reach you. Anywhere on the path, or in the middle of a wide keyboard (the balls' line), one flattens you.
  - **Stages.** Each of the fifteen stages starts on a **checkpoint** keyboard under a great arch ("STAGE N", its name, a Recommended Speed board, and a golden trophy with the Wins it pays). Two **safe keyboards** come between, so a stage is three runs.
  - **The runs** get longer stage by stage, from 47 studs to 214. Each is laid out so that at the stage's Recommended Speed, setting off the moment a ball has passed, you reach the next keyboard with a little to spare: a window of 0.7 s (Stage 1) to 1.3 s (later stages) in every ball's gap. At 75% of that speed the window is about half a second, and at 65% it's close to none.
  - **Helping a new runner.**
    - The first time on the path, a toast says what to do.
    - In the balls' line, the screen's edges glow as the next ball closes in.
    - Out on the side of a wide keyboard, just after a ball has gone by and the way is clear, "GO!" pops up (for the first 60 checkpoints).
    - Each ball rumbles and shakes the ground as it nears, and whooshes as it passes.
  - **The top.** The finish keyboard, the portal to the next world on its east side, and beyond it the chute.
- **Knocked out (the death screen).** A flash, then Boxity's death screen (Boxity shows ads round the game while you're down) and our card in the middle of the screen: "SPLAT! A giant ball rolled over you!", the stage, and three buttons.
  - **REVIVE at Stage N**: FREE once every 3 minutes, else 5 Gems. It puts you out on the side of the stage's checkpoint, in a bubble for a moment.
  - **▶ WATCH AD**: a FREE revive for a rewarded ad, shown only while Boxity has one.
  - **BACK TO Home Row**.

  The buttons wait for Boxity's countdown (at least 4 s on Boxity, none outside it), and nothing ever respawns you by itself. The revive stays on offer for 2 minutes. The server decides which stage it is, never further than you got in that life.
- **The server's own look at the balls.** Your screen calls a hit the moment a ball touches you. The server also checks every move you send, at the time you sent it, against the same balls. If one was well into you (2.4 studs past touching) and your screen said nothing, it knocks you out itself. A revive's 3.6 s bubble counts on the server too.
- **SKIP.** In a stage, SKIP moves you to the next checkpoint, for 8 Gems or a rewarded ad. The skipped checkpoint pays nothing.
- **Wins.**
  - Reaching a stage's end checkpoint pays its Wins: x3 the first time each rebirth, and again every 30 seconds.
  - **TO STAGE** (B) and the **Teleport** panel take you back to any stage you've reached this rebirth.
- **Rebirth by Speed.** It's free:
  - At 10K Speed, then 25K, 62.5K ... (x2.5 each time).
  - You go back to 0 Speed.
  - In return every click gives x1.5, x2 ... for good.
- **Eggs and pets.** Eight Eggs, from 5 Wins to 3.5M: Keycap, Retro, Pastel, Arctic, Neon, Golden, Cosmic and RGB. Each holds five pets, forty in all: a Tabby Tab, a Shift Pup, a Cassette Fox, a Pastel Unicorn, a Blizzard Wolf, a Volt Hound, a Golden Dragon, a Cosmic Wyvern, an RGB Dragon and more. Each follows you and multiplies every click.
- **Upgrades, for Wins:**
  - Clicky Switches (more Speed a click), Turbo Sneakers (run faster), Auto Clicker Pro (Auto Click clicks faster), Mega Keys (MEGA clicks sooner);
  - Spring Socks (jump higher and further), Lucky Keycap (more Wins from every checkpoint), Pet Backpack (room for another pet).
- **Trails and auras.** Eight trails for Wins (Click Sparks to RGB Wave) and five auras for Gems (Static Charge to RGB Overdrive), each multiplying every click.
- **Gems buy time and Speed.**
  - **x2 SPEED** (25 Gems, 15 min) and **x2 WINS** (40 Gems, 10 min). x2 Speed can also be had for 10 minutes for a rewarded ad.
  - Three **Speed packs** (the ⚡ button beside CLICK!, or the Shop's Speed tab): 300, 1,000 or 3,000 clicks' worth at what a click gives you now.
- **The squad boost.** Every other real player in your server adds +10% Speed a click for everyone, up to +50%.
- **The four worlds**, each multiplying Speed and Wins:
  - **Retro Ridge** (x1): beige and grey retro keyboards, a bright day.
  - **Pastel Peaks** (x4): candy pastels, a pink sunset.
  - **Arctic Keys** (x16): white and ice blue, an icy haze.
  - **RGB Galaxy** (x64): night, glowing RGB keys, stars and a nebula.

  The second, third and fourth open at 1, 4 and 8 rebirths, once the world before has been finished.
- **Ball Rush** (RACE on the right, or V):
  - Everyone who presses RACE at about the same time goes in one race. Bots fill only the empty places and take over for a player who leaves.
  - Six lanes side by side. Each is a narrow path with a **pocket** off it every 40 studs, on alternating sides, the same in every lane so it's fair.
  - Giant balls fly out of the finish portal and roll down every lane at the same moment (every 3.2 to 3.8 s, faster at higher race levels). They sink through a grate just ahead of the start line, so the line is safe.
  - Duck into a pocket while one goes by, then run for the next. A ball that hits you **knocks you back** to the pocket behind you; you're never out.
  - Boost arrows here and there. First through the portal wins; when the clock runs out, the furthest up.
- **The rest of a session.**
  - A chain of 37 quests and 3 daily tasks a day (clicks, MEGA clicks, Power Key clicks, checkpoints, races ...).
  - The Lucky Wheel (a spin every 7 minutes, up to 3 saved) and a 7-day daily reward.
  - Playtime gifts at 2, 5, 9, 14, 20, 30 and 45 minutes.
  - Six leaderboards, titles, and a guide of chevrons on the ground (on the Sprintway it points to the side of the next wide keyboard).
- **Codes:** `KEYSPRINT`, `CLICK`, `ENTER`, `BLOXITY`, `LEGION`, `TURBO`, `SPACEBAR`.
- **Pacing.** `tests/economy.mjs` simulated a brand-new player on the real formulas and the real ball timetable, 25 runs of 30 minutes, on 19 November 2026.
  - The player clicks 5 times a second by hand while training on its best Power Key, with Auto Click on from 40 s.
  - Each stage's run costs it its length at its pace, plus about half a ball's gap of waiting on each of the three runs.
  - Its speed gate per stage comes from the real windows: about 80 to 94% of the Recommended Speed's pace, timed well.

  Medians:

  | When | What |
  |---|---|
  | 0:31 | Stage 1 passed |
  | 2:05 | the Tab key (+2) opens; Stage 3 passed |
  | 4:46 | the Shift key (+3) opens; Stage 6 passed |
  | 10:09 | Stage 9 passed |
  | 12:05 | the Caps key (+5) opens |
  | 13:39 | Stage 10 passed |
  | 19:22 | First rebirth |
  | 24:08 | Stage 12 passed |
  | 26:43 | the Enter key (+8) opens |
  | 26:34 (fastest 10%) | Pastel Peaks opens |

  It's a simulation, not a playtest.

## Bloxity integration

Everything goes through `client/src/bloxity.js`. Its one `onUserChanged` subscription is the source of truth for who the player is. `BLOXITY_CODE_METADATA.md` has the integration answers (canDie, hasScore, the boards, gameplay ads off). They were carried over from Lockdown Escape and are for the developer to confirm.

- **Environment.** `env()` returns what Boxity told the page (`Legion.SDK.environment()` / `window.BLOXITY_ENV`), prod when nothing was told. The server reads `BLOXITY_ENV`, `BLOXITY_API_URL`, `BLOXITY_MATCHMAKER_URL`, `BLOXITY_PORTAL_URL` and `BLOXITY_STATIC_URL`. No Boxity host is worked out from the page's own address, and no `api.` / `play.` / `static.bloxity.io` is written anywhere but the two prod fallbacks.
- **Connecting.** Every connect calls `Legion.SDK.net.resolveEndpoint('keysprint')` and makes a new Colyseus Client on that endpoint. While a server wakes up, it retries with a backoff for a minute. **Nothing ever opens a socket to `keysprint.host.bloxity.io`**, which is for HTTP only (`/health`, `/api/stats`).
- **Rooms.**
  - `?roomId=` (Open Rooms, invites, CrazyGames invites) joins that room through its pod first, else matchmaking. The room id is reported with `game.updateRoom`.
  - The room's `maxClients` is 16 (`roomSize` in the deploy).
  - `server/src/legion-room-reporter.js` fills Open Rooms.
- **Identity.**
  - The join options carry `auth.getToken()`. The server verifies it with `POST {BLOXITY_API_URL}/v1/auth/game-token/verify` and uses only the returned `user._id`. Without a token, or with a refused one, the player is a guest with a server-made id.
  - A sign-in mid-game is verified on the same connection, so nobody leaves their room.
  - `carriedFrom` guest progress is copied into an account that has none here yet, once only.
- **Avatars** (`avatar.js`). The platform character kit dresses the rig when `character.canDress` says it can. Otherwise it uses:
  - every accessory slot from `getAccessorySlots()`;
  - skins with pants, shirt and face from `getSkinTextureUrlFor`;
  - proportions;
  - custom uploaded characters.

  Only ids are replicated.
- **Death screen.** `deathScreen.show()` on every knock-out on the Sprintway, including one the server calls:
  - The card's buttons wait for `onCountdown` to reach 0, and respawn only when `respawn()` is true.
  - A race, a rebirth or a world switch while down calls `deathScreen.hide()`.
  - Boxity's "Reset Character" (`respawn_request`) is still instant for a living player.
- **Ads.**
  - `ads.onBreakStart` / `onBreakEnd` stop and restart the frame loop and the sound.
  - `declareScreens` lists `panel`, `lobby` (Ball Rush's start line), `results` and `gameplay` (no banners in play). `ads.screen()` is reported as each opens.
  - Rewarded ads `revive`, `skip-stage` and `x2-speed` show only while `isAvailable()`, and are granted only after the server verifies the token (`POST /v1/ads/reward/verify`).
- **Leaderboards.** The client calls `leaderboard.define()` right after init. The server reports from its own state, batched every 15 s and only for `legion_` ids:
  - **Wins**: sum, weekly;
  - **Top Speed**: best, all time;
  - **Clicks**: sum, weekly (every click the server counts);
  - **Highest Stage**: best, weekly, counted across worlds;
  - **Rebirths**: best, all time;
  - **Races Won**: sum, weekly.

  The Leaderboards panel opens Boxity's own (`leaderboard.open`).
- **Gems purchases.** None: the game has no in-app purchases, so there are no SKUs and no webhook.
- **Also wired:**
  - **Chat:** Boxity chat bubbles over heads, found by the Boxity id in `PlayerState.bx`.
  - **Emotes:** `registerFeature('emotes')` at boot; `play_emote` is played and relayed.
  - **Settings:** `master_volume`, `music_volume`, `graphics_quality`, `camera_sensitivity` and `show_fps`.
  - **Lifecycle:** `loadingStep`, then `loadingEnd` as soon as the game has joined a server. There is no start menu.
  - **ESC** opens Boxity's menu.
  - **CrazyGames:** P is never bound (race is V), and there is no fullscreen button of the game's own.

## Controls

| Action | Keyboard / mouse | Controller | Touch |
|---|---|---|---|
| Click | E, CLICK!, a left-click on the world | B or RB | CLICK!, a tap on the world |
| Auto Click on / off | AUTO | The ring to AUTO, A | AUTO |
| Run | WASD / arrows | Left stick | The stick |
| Jump | Space | A | JUMP |
| Dash | Shift, Enter | RT, LT or X | DASH |
| Revive (death card) / use | F | Y | The card's buttons |
| Back to Home Row (death card) / home | R | L3 | The card's button |
| To your best stage | B | Y | TO STAGE |
| Camera | Drag, wheel | Right stick | Drag, pinch |
| Race | V | LB | RACE |
| Pets / Upgrades / Teleport / Wheel / Quests / Shop / Sound | J / U / T / C / Q / G / M | D-pad to the HUD, A to press | The buttons |

## Sound

- **Key clacks and effects**: synthesised sample by sample in a worker while the world builds.
  - Each click and each step is a key press: a click, a clack and a thock, a dozen variations, so fast clicking sounds like fast typing.
  - A click on a Power Key is a long key's deep thock with its stabilisers rattling. A MEGA click is a huge thock under a sparkle of chimes.
  - The balls: a low rumble that grows as one nears (with the ground shaking), a whoosh as it passes, a smash when one gets you.
  - Chimes and fanfares for Wins, quests and rebirths.
- **Music**, all our own, each rendered once into loops by an OfflineAudioContext behind the loading screen (never note by note in play):
  - **"Home Row Hop"**, the Home Row song: G major, 120 BPM, swung, with marimba over a soft pad and a bouncing bass.
  - **"Turbo Typing"**, the Sprintway and race song: A minor, 156 BPM, a driving bass and four-on-the-floor, with a two-tone call every few bars.

## Graphics and performance

- **Lighting and materials:**
  - The top games' lighting: hemisphere 1.1, ambient 0.45, sun 1.5, PCF shadows, no tone mapping.
  - **Only matte Lambert and unlit materials.** No reflections, environment maps, bloom or post-processing.
  - Each world's mood tints the rig and sets its sky and its cloud sea.
- **Our own art, all built in code:**
  - **Home Row:** the spawn on a giant keyboard; the nine Power Keys, each with its "+N / CLICK" sign; a giant keyball turning on its stand ("WATCH OUT!"); keycap mascots, a giant coffee mug, giant pencils and an eraser; the UPGRADES, REBIRTH and KEY SHOP booths, Eggs, the worlds portal and the BALL RUSH gate.
  - **The Sprintway:**
    - the narrow path of keys and the wide keyboards, each in a floating moulded case over the clouds, with low bezels, LEDs and keycap bollards;
    - safe sides in the world's accent keys, with glowing lines;
    - checkpoint arches with their screens, golden trophies and Recommended Speed boards;
    - the ball drain (a round well with a striped rim and red lights) and the ball chute (a tower with a round tunnel mouth ringed in lights).
  - **The balls:** spheres tiled with keycaps in the world's colourway (gaps that glow in RGB Galaxy), spinning like wheels as they roll. One instanced draw for all of them; only the few nearest the camera are placed each frame, and they fade right in front of the lens.
  - **The sky:** a shader-drawn cloud sea, cloud puffs, floating keyboards and keycaps drifting on the horizon.
- **Keeping it fast:**
  - The keycap floor is instanced in chunks (sculpted near, plain far), with the press and ripple in the vertex shader; the balls press the keys under them as they roll.
  - The Power Keys are one instanced mesh; a click presses a key down by its instance alone.
  - The floating numbers are drawn from one glyph sheet in one draw (a MEGA click's word is a cached sprite of its own). On Low, a click's number comes at most ten times a second.
  - Static things are merged per stage into BatchedMeshes culled per stage.
  - Every shader, panel and emoji is warmed up behind the loading screen.
  - The HUD writes only on change and moves its bars with transforms.
- **Weak devices start on Low:** phones, and PCs with 4 cores or fewer, 4 GB or less, or an older Intel or small Radeon GPU. Below 54 FPS the resolution steps down first, then the quality.

- **Measured** on this PC on 19 November 2026 (`LOW_GPU=1 node tests/perf.mjs`), the ball-run build. Setup:
  - Intel UHD Graphics on ANGLE D3D11, Chrome headless, a 144 Hz display.
  - The automatic resolution step-down was switched off, so these are the worst case.
  - Frames drawn per second. *Paced* means the game drew every other refresh of the fast screen.

  | Device | Running the Sprintway (autopilot) | Clicking on a Power Key | At a checkpoint | Beside the balls | At the spawn | In a race | Load + join (dev build) |
  |---|---|---|---|---|---|---|---|
  | Desktop, 1920x1080, High | 72 | 65 paced | 72 paced | 87 | 72 paced | 72 paced | 8.7 s |
  | Desktop, 1600x900, Medium | 123 | 126 | 143 | 144 | 142 | 144 | 4.7 s |
  | **Weak laptop**: CPU throttled 4x, 1366x768, Low | 44 | 42 | 61 paced | 68 paced | 74 | 59 | 10.0 s |
  | **Phone**: 844x390 @2x, touch, Low, CPU 4x | 45 | 45 | 64 | 72 | 83 paced | 70 | 13.3 s |
  | **Phone**: 390x844 @2x, touch, Low, CPU 4x | 50 | 43 | 64 | 66 | 72 | 59 | 17.6 s |

  - The slowest cases are the simulated weak laptop and phones running or clicking: 42 to 50 FPS, under the game's 54 FPS target. There the game steps its resolution and then its quality down on its own.
  - The Sprintway draws about 210k triangles at High (about 72k on Low).
  - The phones are simulated (a desktop chip and a throttled CPU). Nothing has been measured on a real phone or on the Legion servers yet.

## Keeping players (what the live stats said)

On 20 November 2026, a day after launch, `/api/stats` showed 1,199 sessions: a median of 2.6 minutes (a mean of 5.7), 21% gone inside a minute, and phones shorter than desktops. The numbers that explained it:
- **49% of sessions made 3 clicks or fewer** and lasted about 80 s. Players who clicked 50+ times lasted about 420 s. Many ran the Sprintway like an obstacle course, passed Stage 1, died twice at Stage 2 with no Speed, and left.
- 35% never reached a first checkpoint (median 57 s); 64% did, at a median of 61 s.
- Loading took 8.6 s on desktop and 11.1 s on phones (median).

What changed because of it:
- Auto Click starts ON, so Speed grows from the first second (and in the background).
- A newer player (under 10 checkpoints) gets the words in the stage bar: "WAIT: let the ball pass", "GO! RUN UP THE PATH!", "BALL! GO TO THE SIDE!".
- The Egg quest comes right after Stage 3, and a toast says when the first Egg (5 Wins) is affordable.
- The page no longer downloads the unminified 1.4 MB `three.core.js` (jsDelivr's `three.module.min.js` still imports it): an import-map entry sends it to the minified core, so a load is about 1.9 MB, not 3.3 MB.
- The shader compile now runs while the HUD panels are warmed, not after them.

Not changed, and worth watching in the next day's stats: the loading time itself (the shader warm-up is the longest step), phones under 30 FPS (their sessions average 2 to 2.5 minutes), and the few players who finish the whole game's economy in under an hour.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome. Their own ports (3212 / 5733; `TEST_PORT` and `VITE_PORT` move them, so two suites can run side by side) leave a running game on 3205 alone.

- **`tests/server.test.mjs`**: the whole loop and its guards, headless. Among them:
  - clicks and their guard (the rate limit, batches, a Power Key only where you stand, none in a race or while down), MEGA clicks, the Speed-to-running-speed curve and the move guard;
  - **the balls**: in their line one flattens you, called by the server itself; out on the side of a safe keyboard two roll by; a revive puts you clear of them;
  - checkpoints and Wins;
  - knock-outs and revives: FREE, then Gems, one at a time; the revive open for the death screen's 2 minutes; a made-up rewarded-ad token granting no revive, skip or x2; BACK TO HOME ROW;
  - spending, rewards, SKIP, rebirth by Speed and worlds, the squad boost;
  - **Ball Rush**: the queue, bots, a late player; a racer who waits in the pockets for the way to clear finishes with no knock-back; one who stands in a lane's way is knocked back to the start (the server's call); the start line is never reached by a ball; prizes;
  - nonsense messages, saves.
- **`tests/smoke.mjs`**: the page loads and joins, music loops, clicks count (E, the CLICK button, Auto Click, a MEGA click), the Speed bar, a Speed pack, SKIP, and the death card ("SPLAT! A giant ball rolled over you!", revive into the stage, back to Home Row, a revive nobody answers). Then a **stand-in Boxity SDK** whose death screen counts down 4 to 0 checks:
  - `init` with the slug, emotes registered, the six boards declared;
  - screens declared and `gameplay` reported, `loadingEnd` once;
  - pressing a button during the countdown does nothing, and REVIVE respawns only on `respawn() === true`;
  - an ad break pauses the frame loop and resumes it.
- **`tests/retention.mjs`**: a first visit has Auto Click ON and Speed grows with no input; it keeps clicking with no frames (a hidden tab); turning it off sticks; the stage bar tells a new player to wait, to GO, or to step to the side.
- **`tests/hazards.mjs`**: on a real screen, standing on the path the next ball flattens you; out on the side of a safe keyboard two balls roll by; in the middle of one you're flattened; a revive's bubble keeps you safe a moment; the path climbs and you never fall through it.
- **`tests/autopilot.mjs`**: the autopilot plays the whole loop: Auto Click, through the gate and round the drain, the ball runs, checkpoints, a knock-out and revive, Train onto a Power Key, Custom Speed. Then full Ball Rush races on all four maps, and a run in each other world. No snaps, no console errors.
- **`tests/passable.mjs`**: every stage of every world is passed at its Recommended Speed by the autopilot dodging the balls (it prints each stage's tightest window and the deaths it took).
- **`tests/latency.mjs`**: two players through a 350 ms round trip. Clicking twelve a second, Speed never jumps back and no click is lost; a checkpoint is paid by the server; a knock-out and revive happen with no snap; one race for both, pocket to pocket.
- **`tests/reconnect.mjs`**: a dropped connection on Home Row (Auto Click's clicks still count) and in a race, short and long.
- **`tests/gamepad.mjs`**: the whole game on a controller: B and RB clicking on a Power Key, a checkpoint on the stick, the death card's revive with Y, a race.
- **`tests/prod.mjs`**: the production build with real input only, no QA hooks:
  - on desktop: E, the CLICK button and a click on the world (the 20th a MEGA click). Then Stage 1 run by hand with W / A / D: out to the side of each safe keyboard, waiting for a ball to pass, timed from the game's own ball timetable on the server's clock, with your position read off the stage bar. Then the Stage 2 checkpoint's Wins, a step into the balls' line and the death card, and the revive. After that: Custom Speed, codes, an upgrade and an Egg, every panel, a Speed pack, Train onto a Power Key, Auto Click, a whole race;
  - on a portrait phone, touch only: CLICK! and a tap on the world, DASH with a thumb on the stick, Stage 1's runs by the stick, a death and a revive, two-finger presses.
- **`tests/economy.mjs`**: the pacing above.
- **`tests/screens.mjs`**: every screen at 390x844, 360x800, 375x667, a landscape phone and desktop.
- **`tests/perf.mjs`**: frame rates (`ONLY=2` runs just the weak laptop).
- **`tests/look.mjs`**, **`lobby-look.mjs`**, **`race-look.mjs`**, **`stages.mjs`**: screenshots.
- **`tests/covers.mjs`**: renders the two store covers from the game (a runner fleeing a giant ball down the path). **`tests/setup-page.mjs`**: writes `bloxity-setup.html`.

**Last runs, 19 November 2026, after the ball run and Ball Rush went in:**

| Suite | Result |
|---|---|
| Server | 116 / 116 (three runs in a row) |
| Every stage passable | 60 / 60 at the final, harder difficulty |
| Smoke | all good, the stand-in SDK's death screen included |
| Hazards | all good |
| Autopilot | all good: through the gate, the ball runs, a knock-out and revive, Power Keys, every race map |
| Controller | all good |
| Reconnect | all good |
| Latency (350 ms) | all good |
| Screens | no problems at 13 sizes (a toast over the death card on short landscape screens was fixed after an earlier run) |
| Production build, real input | the desktop run passes (clicks, the hand-run of Stage 1 round the balls, panels, a race); the phone part's Stage 1 run by thumb still fails (see below) |

**Not passing yet:** in `tests/prod.mjs`, the portrait-phone run of Stage 1 with a thumb on the stick (the checks "the stick dodges Stage 1's balls" and the touch revive). The same run on desktop keys passes and the controller test passes, so it is probably the test's thumb timing, but it has not been shown to be.

## Deploying (prod + stage)

`.github/workflows/deploy.yml` deploys every push.

- **Platforms.** `main` goes to the production channel and `dev` to the playtest channel. Prod always gets them; stage gets them too once the repo has `LEGION_DEPLOY_TOKEN_STAGE`. A manual run (Actions → Run workflow, `target`: staging or prod) deploys any branch to one platform.
- **Isolation.**
  - The platforms are separate matrix jobs (`fail-fast: false`), so a stage failure never blocks prod.
  - A staging job reads only the stage token and fails clearly when it's missing.
  - There is one client build for both, with no environment baked in.
  - Server images are tagged per platform (`stage-<channel>-<sha>` on stage).

Repository secrets to add:
- **`LEGION_DEPLOY_TOKEN`**, from hosting.bloxity.io.
- **`LEGION_DEPLOY_TOKEN_STAGE`**, from hosting.stage.bloxity.io, to ship to stage too. See docs.bloxity.io › Environments › Getting your game onto stage.

**Live at https://keysprint.play.bloxity.io**, first deployed on 19 November 2026.

- The repository is `asivixlp44-cmyk/keysprint`. Every push to `main` deploys there (the first run took 1 min 27 s).
- `node tests/live-smoke.mjs` checks the live game. On the first day it loaded the game, joined a server and showed the HUD. Its one console error is a 404 from `api.bloxity.io/v1/domains/resolve` for this host, which comes from Boxity's own side and is probably there until the game is created on Boxity.
- From the machine used to build the game, `curl` and Node could not reach any `*.bloxity.io` address (the secure connection was reset, the older Lockdown game too), while Chrome could. That is that PC's network, not the deploy.

`bloxity-setup.html` has every field of Bloxity's Create New Game form with copy buttons, and the two covers (`covers/cover-1920x1080.png` and `covers/cover-800x800.png`, rendered by `tests/covers.mjs`).

Play stats are at `GET /api/stats?key=<stats key>&days=7` on the host. Keysprint has its own key, in `server/STATS_KEY.local.txt` (git-ignored); only its SHA-256 is in the code.
