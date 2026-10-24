# Gubbe på Vägen: notes for Claude

A GTA-style 3D browser game set in central Stockholm, built with Three.js r128 (loaded from `lib/three.min.js`, so it runs offline). The player walks around, drives over 50 real cars plus boats, jet skis and a moped, runs from the police, does jobs and races, and can play with up to eight friends online. Open `index.html` in a browser to play. There is no build step and no install.

The owner is Elvin (15). He speaks Swedish and is learning to program, so keep explanations to him short, simple and in Swedish.

## Where new code goes

The game used to be one big file and was split into the files below following **`PLAN.md`** (done). Keep it that way:

- New code goes in the file it belongs to (a new car in `src/vehicles/models.js`, a new sound in `src/sound.js`, and so on). Update the map below when a file gets a new job.
- A file that grows over about 1,500 lines is split, at a section header, into two files that load one after the other. Add the new `<script>` tag in `index.html` right after the old one, and update the map.
- Leftover clean-up ideas are under "Saker att fixa senare" at the end of `PLAN.md`.
- Every PR that changes the game raises `VERSION.nr` at the top of `src/core.js` by one and sets `VERSION.date` to the day (in Swedish, like `21 oktober 2026`). The version stands in the bottom right corner, and friends in a room are told when theirs differ.
- The big update Elvin wants next is planned in **`UPPDATERING.md`** (in Swedish). Work through it in order, one item per PR, and tick each item off when it is done.

## Language

- Code, identifiers and comments: **English**, as they are now.
- Everything the player sees (UI text, car descriptions, help), `README.md`, commit messages and PR descriptions: **Swedish**.
- This file: English.

## How to find things

The game is these files, loaded in this order:

- `index.html` (about 250 lines): only the HTML for the HUD, maps, start sign and car picker, plus the `<link>` and `<script>` tags.
- `style.css` (about 410 lines): all the styles.
- `lib/three.min.js`: Three.js r128.
- `src/core.js` (about 580 lines): helpers, seeded random, the Three.js check, renderer and scene, geometry helpers, textures.
- `src/city/map.js` (about 740 lines): Stockholm's land, water and street graph, where you can stand, the obstacle grid.
- `src/city/build.js` (about 1,250 lines): building the city, from the ground and quays to the landmarks and the police station.
- `src/city/blocks.js` (about 530 lines): the layout of the house in Drakens gränd, the buildings along every other street, boats, signs, Globen, and assembling the meshes.
- `src/city/draken.js` (about 960 lines): the yellow house in Drakens gränd with the penthouse and the lift, then the instanced trees and street lamps.
- `src/people.js` (about 130 lines): person models, the spawn spot and the player.
- `src/vehicles/models.js` (about 740 lines): every car, boat, police and military model as data, and the gearbox.
- `src/vehicles/cars.js` (about 1,490 lines): car materials, body and wheel geometry, `makeCar`.
- `src/vehicles/physics.js` (about 590 lines): car physics, smoke and sparks, skid marks, damage, people physics.
- `src/traffic.js` (about 300 lines): the traffic AI and the pedestrians.
- `src/police.js` (about 870 lines): wanted stars, chases, the sjöpolis and the navy, the helicopter.
- `src/police-stops.js` (about 740 lines): police on the ground (stops, arrests, the cells), then the traffic spawned at start.
- `src/activities.js` (about 1,180 lines): Högvakten and the Dalahäst hunt, jobs and street races, ice cream kiosks and balloon sellers.
- `src/helicopter.js` (about 250 lines): the helicopter you fly yourself, its pad on Skeppsbron and the landing on Kaknästornet.
- `src/parachute.js` (about 220 lines): jumping with a parachute, from the helicopter or from the top of Kaknästornet and a Hötorgsskrapa.
- `src/metro.js` (about 170 lines): the tunnelbana: the board at the T signs, the lines, the ride and fare dodging.
- `src/rides.js` (about 190 lines): riding the Ferris wheel, the free-fall tower, the carousel and the roller coaster at Gröna Lund.
- `src/water-balloons.js` (about 360 lines): the buckets of water balloons beside the balloon sellers, throwing, splashes and getting soaked.
- `src/workshop.js` (about 420 lines): the workshop on Götgatan: its hall, the board for paint, rims, springs, engine and repairs, and what is kept per model.
- `src/weather.js` (about 220 lines): sun, rain and snow: wet streets, white roofs, slippery roads, the drops and flakes, the wipers and the thunder.
- `src/daynight.js` (about 230 lines): the time of day: the sun, the sky, the light, the moon and stars, lamps, lit windows and headlights at night.
- `src/progress.js` (about 250 lines): levels and trophies: XP, the level in the corner, new trophies and levels on the screen, the board (I).
- `src/gameplay.js` (about 610 lines): input state, the car picker, traffic upkeep, one simulation step, moving the meshes and the camera.
- `src/hud.js` (about 390 lines): on-screen text, the minimap and the big map.
- `src/sound.js` (about 360 lines): synthesised engine sounds and effects.
- `src/input.js` (about 150 lines): keyboard, touch and the start screen.
- `src/post.js` (about 320 lines): graphics quality levels and post-processing.
- `src/multiplayer.js` (about 1,070 lines): playing with friends.
- `src/party.js` (about 540 lines): games with friends: Polis och tjuv, Kurragömma and Gatlopp mot varandra.
- `src/main.js` (about 160 lines): the main loop, adaptive resolution and the test hooks. Loaded last.

Each part of the JavaScript starts with a section header comment. Grep for the header (or a name from the table) and read only that range:

- Big sections: `/* ================= name ================= */`
- Subsections: `/* ---------- name ---------- */`

Line numbers drift with every change, so search instead of trusting numbers. Each file in `src/` is a plain script with `'use strict';` at the top and no wrapper function (the code still has its old two-space indent). Top-level names are globals shared by every `<script>` on the page, so a name from one file may be used in any other: grep all of `src/` for a name before renaming or removing it. Code that runs while a file loads can only use what earlier files (or earlier lines) define; functions are hoisted only within their own file. So when code moves to a new file, a helper it calls at load time must already be defined in an earlier file (that is why `curve` and `tubeTo` moved to `src/core.js`, and `boatFree` and `findBerth` to the end of `src/vehicles/physics.js`). A new top-level name must not clash with a browser global (`top`, `name`, `status`, `stop`, …); that is why the police stop's state is called `policeStop`. If Three.js is missing, the check at the top shows a message and throws, which stops the script.

| File | Section header | What's in it | Key names |
| --- | --- | --- | --- |
| `style.css` | `HUD`, `start sign`, `big map`, `car picker`, `touch controls`, `playing with friends…` | Styles for the overlays | |
| `src/core.js` | *(start of the file)* | Helpers, seeded random | `$`, `clamp`, `lerp`, `rand`, `pick`, `TAU` |
| `src/core.js` | `renderer & scene`, `geometry helpers`, `textures` | Three.js setup, mesh and texture helpers (also `curve` and `tubeTo`, which the city and the cars both use) | `renderer`, `scene`, `camera`, `Merger` |
| `src/city/map.js` | `Stockholm: land, water and streets` | Map data: land polygons, the street graph, walkable raster, obstacle grid | `nodes`, `edges` |
| `src/city/build.js` | `the city: ground, quays, streets` (and its subsections up to `landmarks`) | Building the city: parks, Gröna Lund, streets, bridges, lamps, car park, buildings, landmarks | `landmarkList` |
| `src/city/build.js` | `Polisstationen on Stora Nygatan` | The police station building and its logic | `STATION` |
| `src/city/blocks.js` | `Drakens gränd: the yellow house…` up to `assemble the meshes` | The layout of the house in Drakens gränd, the buildings along every other street, boats, signs, Globen, finer materials, assembling the meshes | `DRAKEN` |
| `src/city/draken.js` | `Drakens gränd: building the yellow house` | The yellow house with the three-floor penthouse and the lift | `LIFT` |
| `src/city/draken.js` | `trees and street lamps…` | Instanced trees and lamps | |
| `src/people.js` | `people` | Person models and the player | `persons`, `player`, `makePerson` |
| `src/vehicles/models.js` | `vehicles`, `gearbox and engine` | **All car, boat, police and military models as data**, then the gearbox | `MODELS`, `MODEL`, `PICKABLE`, `SECRET` |
| `src/vehicles/cars.js` | `car materials` | Car materials, car body, moped, boat and military geometry, wheels, building a car | `carShape`, `wheelGeometry`, `cars`, `makeCar` |
| `src/vehicles/physics.js` | `car physics`, `particles…`, `skid marks`, `damage`, `people physics` | Driving physics, smoke and sparks, crashes | `crash` |
| `src/traffic.js` | `traffic AI`, `pedestrians` | Bot drivers and walkers | `botThink`, `npcThink` |
| `src/police.js` | `police`, `the sjöpolis and the navy`, `the police helicopter` | Wanted stars, chases, police boats, military, helicopter | `limitAt`, `startChase`, `endChase`, `policeThink`, `policeUpdate`, `WATER`, `updateHeli` |
| `src/police-stops.js` | `police on the ground…` | Stops, constables on foot, arrests and the cells | `policeStop`, `beginStop`, `useKey` |
| `src/police-stops.js` | `initial traffic` | Spawns traffic, police and moored boats at start | |
| `src/activities.js` | `Högvakten and the Dalahäst hunt`, `jobs and street races`, `ice cream kiosks and balloon sellers` | Side activities | `JOBS`, `VENDORS` |
| `src/helicopter.js` | `the helicopter you fly` | The red Bell 429 (the police helicopter's model, `buildHeli(true)`), its flying, landing on roofs, the pad and its HUD box. While you fly, `driving` is null and the player follows it, like riding along. | `FLY` |
| `src/parachute.js` | `the parachute` | Freefall and the canopy, steering, landing (hard, soft, in the water, on a roof), the towers to jump from. While you jump, `CHUTE.step` moves the player in place of `personMove`. Uses `FLY.heightAt` for the roofs. | `CHUTE` |
| `src/metro.js` | `the tunnelbana` | The stations are the T signs (`mapLabels` of kind `tbana`), the green, red and blue lines with changes, the board (pauses the game like the car picker), the ride as an overlay, the ticket from the Kassa and the inspectors | `METRO` |
| `src/rides.js` | `the rides at Gröna Lund` | Getting on (30 kr), queueing for the tower and the coaster, the seat you sit in and the camera there (`RIDES.view`, used by `updateCamera`). The rides themselves move in `TIVOLI` in `src/city/build.js`, which also has the coaster's train. | `RIDES` |
| `src/water-balloons.js` | `water balloons` | The bucket beside each balloon seller (E buys five), throwing (a click with the mouse caught, F on foot, the touch button) the way the camera looks, from your hand, a car, the helicopter or a ride, the flight and what it hits (people, cars, houses, the ground, the water), splashes and wet patches, and soaked people (`p.wetT`, a darker, shiny material that drips). A wet police officer or police car starts a chase (`startChase('ballong')`). With friends: MP's `wb` event carries a throw and `wet` says who was hit; flag 16 in the state means soaked. | `SPLASH` |
| `src/workshop.js` | `the workshop` | Verkstaden on Götgatan, in the lot of a house that is left out (`WORKSHOP_LOT` in `src/city/blocks.js`: the house throws its dice so every other house stays the same, and its obstacle is switched off). Drive onto the bay and the board opens (it pauses the game like the car picker; `WORKSHOP.view` is the camera, used by `updateCamera`). Paint (`sharedCarGeometry`), rims (`wheelGeometry`, `caliperGeometry`), lowering (`c.body.position.y`) and the engine (`c.boost`, `c.speedK`, `c.gripK`, read by the car physics), and repairs. Kept per model in `localStorage` (`gubbe-verkstad`) and fitted by `chooseModel`. Friends get the rims and the lowering as the 17th field of the car in MP's state. | `WORKSHOP` |
| `src/weather.js` | `weather` | Clear, rain or snow (snow in place of rain from November to March), changing by itself every few minutes; U changes it, and with friends the host decides (MP's `weather` event, and in `welcome`). The streets' wetness and the lying snow are uniforms in a shader added to the ground (`GROUND` in `src/city/draken.js`), the roofs (`solidMat`) and the trees (`leafMat`). Drops and flakes in a box round the camera, the windscreen with the wipers (`#rainScreen`), the rain's sound and thunder. `tint` greys the sky and light and is called by `DAYNIGHT` after its colours; `grip` and `brake` slow your car's grip and brakes in the car physics. | `WEATHER` |
| `src/daynight.js` | `day and night` | A day takes 20 minutes (start at 10:00, where the sun used to stand). It moves the sun (`SUN_DIR` for the sky, `SUN_OFF` for the light; after dark the same light is the moon), blends the sky's uniforms (`skyMaterial` in `src/core.js`), the fog, `hemi` and the exposure between day, sunset and night, and bakes the sky light again (`bakeEnv`) every quarter of an hour. At night the street lamps' diffusers glow (`lampMat` in `src/city/draken.js`) with pools of light under them, the windows light up (an emissive atlas on `facadeMat`/`modernMat`, lit per window by a hash in the shader), and cars get headlights (`DAYNIGHT.head`, used in `animate`) and a light on the road ahead. The host sends the time (MP's `time` event, and in `welcome`). O winds an hour on. | `DAYNIGHT` |
| `src/progress.js` | `levels and trophies` | XP from a job's pay (`PROGRESS.job`, called by `pay` in `JOBS`), Dalahästar, getting away from the police (`PROGRESS.escaped`, in `policeUpdate`) and games with friends (`PROGRESS.played`, in `PARTY`'s results). A trophy is a number to reach in one of the counts in `S.st`: other files count with `PROGRESS.did(stat)` or `did(stat, what)` (the different things of a kind, each once), and speed, distance, models, night and the tuned engine are watched in `update`. Levels unlock the workshop's best parts: `WORKSHOP.unlocks`, from the `lv` on its parts (`locked(lv)` disables them on the board). The board (I, or a click on the level) pauses the game like the car picker. Kept in `localStorage` (`gubbe-niva`). | `PROGRESS` |
| `src/gameplay.js` | `game state`, `car picker`, `traffic upkeep` | Input state, picking a car, keeping traffic around the player | `keys`, `readInput`, `chooseModel`, `manageTraffic` |
| `src/gameplay.js` | `simulation step`, `visuals` | One physics step, moving meshes, the camera | `physicsStep`, `animate`, `updateCamera` |
| `src/hud.js` | `HUD`, `minimap`, `the big map` | On-screen text and both maps | `updateHUD`, `drawMap`, `bigmap`, `drawBigmap` |
| `src/sound.js` | `sound` | Synthesised engine sounds and effects | `ENGINE_SOUNDS`, `updateAudio` |
| `src/input.js` | `input` | Keyboard, touch and the start screen | `startGame` |
| `src/post.js` | `post-processing` | Graphics quality levels and effects | `POST` |
| `src/multiplayer.js` | `playing with friends` | Multiplayer over WebRTC (PeerJS), with MQTT as fallback. Libraries load only when used. | `MP` |
| `src/party.js` | `games with friends` | Games for everyone in a room (Polis och tjuv, Kurragömma, Gatlopp mot varandra). Kurragömma is Polis och tjuv with a dark screen while the seeker counts, and the hiders' signs and map dots hidden from the seeker (`MP.badge(…, hide)`). The one who has the room keeps the score and sends it to the others as `game` events. A race against friends is an ordinary street race in each game (`JOBS.partyRace`) that reports its progress and time. | `PARTY` |
| `src/main.js` | `loop` | The main loop, adaptive resolution and the test hooks | `tick`, `frame`, `window.gubbeTest` |

## How the parts depend on each other

- The code runs top to bottom when the page loads. The city is built first, then models, cars and people, then traffic and police. Code that runs at load time can only use what is defined above it, so **keep this order** when moving code.
- The street graph (`nodes`, `edges`) is used by traffic, police, jobs, races and both maps.
- Car physics and `makeCar` are used by the player, traffic, police, boats (`WATER`) and multiplayer.
- `tick` in the `loop` section calls everything once per frame: input, AI, physics steps, police, helicopter, jobs, vendors, camera, HUD, maps and sound.
- Multiplayer (`MP`) reads the player, `MODEL` and `makeCar` to show friends and their cars.
- The games (`PARTY`) talk to `MP` only through `MP.games(...)`, `MP.event('game', …)`, `MP.friends()` and `MP.badge(...)`.

## Adding a car (the most common request)

Add one object to the `MODELS` array in `src/vehicles/models.js`, copying a similar car. Important fields:

- `id` (unique), `name` (real model name), `kind` and `def` (Swedish type and Swedish definite-form nickname, e.g. `'Golfen'`)
- Size and performance: `W`, `L`, `R` (wheel radius), `wb` (wheelbase), `max` (top speed m/s), `zero`, `brake`, `mass`, `grip`
- `colors`, `gears`, `idle`, `red`, `eng` (must be a key in `ENGINE_SOUNDS`), `rim`
- `shape`: the body lines; the comment above `MODELS` explains every field
- Flags: `sport`, `ev`, `bus`, `moped`, `boat`, `police`, `mil`. Everything except police and military vehicles is on the car picker's normal pages (`PICKABLE`). Police and military vehicles are on the picker's secret page (B twice, or a double tap on its heading), built from `SECRET`.

Then mention the car in `README.md` if it lists similar cars.

## Testing

`window.gubbeTest` (end of the script) lets code drive the game without a player: `start()`, `run(seconds)`, `key(code, down)`, `press(code)`, `teleport(x, z)`, `choose(id)`, `showroom(ids, x, z, gap)` (builds cars side by side), `shot(...)` (fixed-camera screenshot), `info()` (render stats), `mapProblems()` (landmarks standing on streets; should not grow), `engineSample(...)` (measures an engine sound).

**Run `npm test` before every PR, and don't open the PR until it is green.** The first time, run `npm install` and `npx playwright install chromium`. The smoke test (`tests/smoke.spec.js`, Playwright) opens `index.html` from disk in headless Chromium and checks that the page loads without console errors, that `start()` + `run(10)` works, that the player can get into a car and drive it away, that `mapProblems()` doesn't grow, and that every model in `MODELS` builds. `tests/baseline.spec.js` checks the invariants for the split in `PLAN.md`: with `Math.random` seeded, a fixed `teleport` and a camera `shot`, the draw calls, triangles, geometries, `MODELS.length` and `mapProblems().length` must equal `tests/baseline.json`, and the 3D picture must match `tests/baseline.png` within 1 % of the pixels. A step that only moves code must not change them. After a real change to the game, record a new baseline with `npm run baseline` in its own commit. The tests take under a minute. GitHub Actions (`.github/workflows/test.yml`) also runs it on every pull request; if that check fails, fix it on the same branch. The game itself never needs `npm install`: `package.json` exists only for the tests.

## Working rules

- One Claude session at a time on this repo. Parallel sessions editing the same files cause merge conflicts.
- When moving code between files, move it **without changing it**. Only change what is needed for it to work in its new file, and check that `npm test` and the baseline stay the same.
- Keep changes small and focused. Don't refactor or "tidy up" code that the task doesn't touch.
- The game must keep working when `index.html` is opened directly from disk (`file://`). Don't introduce ES modules or a build step.
