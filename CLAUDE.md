# Gubbe på Vägen: notes for Claude

A GTA-style 3D browser game set in central Stockholm, built with Three.js r128. The player walks around, drives over 50 real cars plus boats, jet skis and a moped, runs from the police, does jobs and races, and can play with up to eight friends online. Open `index.html` in a browser to play. There is no build step and no install.

The owner is Elvin (15). He speaks Swedish and is learning to program, so keep explanations to him short, simple and in Swedish.

## Ongoing work: splitting the file

The game is being split into smaller files, one step per PR, following **`PLAN.md`**. When asked to "do the next PR in PLAN.md", do exactly the unchecked PR section that comes first, tick its boxes in `PLAN.md` in the same PR, and update the map below. Follow the agent rules in `PLAN.md`.

## Language

- Code, identifiers and comments: **English**, as they are now.
- Everything the player sees (UI text, car descriptions, help), `README.md`, commit messages and PR descriptions: **Swedish**.
- This file: English.

## How to find things

`index.html` is about 13,700 lines and roughly 300k tokens. **Never read it whole.** Each part starts with a section header comment. Grep for the header (or a name from the table) and read only that range:

- Big sections: `/* ================= name ================= */`
- Subsections: `/* ---------- name ---------- */`

Line numbers drift with every change, so search instead of trusting numbers. Lines 1–620 are CSS and HTML; the rest is one script inside `(function () { 'use strict'; … })()`. Everything inside shares one scope, so a top-level name in one section may be used anywhere: grep for a name before renaming or removing it.

| Section header | What's in it | Key names |
| --- | --- | --- |
| *(CSS, top of file)* `HUD`, `start sign`, `big map`, `car picker`, `touch controls`, `playing with friends…` | Styles for the overlays | |
| *(script start)* | Helpers, seeded random | `$`, `clamp`, `lerp`, `rand`, `pick`, `TAU` |
| `renderer & scene`, `geometry helpers`, `textures` | Three.js setup, mesh and texture helpers | `renderer`, `scene`, `camera` |
| `Stockholm: land, water and streets` | Map data: land polygons, the street graph, walkable raster, obstacle grid | `nodes`, `edges` |
| `the city: ground, quays, streets` (and its subsections) | Building the city: parks, Gröna Lund, streets, bridges, lamps, car park, buildings, landmarks, boats, signs, Globen | `landmarkList` |
| `Polisstationen on Stora Nygatan` | The police station building and its logic | `STATION` |
| `Drakens gränd…` (two subsections) | The yellow house with the three-floor penthouse and the lift | `DRAKEN`, `LIFT` |
| `people` | Person models and the player | `persons`, `player`, `makePerson` |
| `vehicles` | **All car, boat, police and military models as data**, then gearbox, materials, car body and wheel geometry | `MODELS`, `MODEL`, `PICKABLE`, `SECRET`, `carShape`, `wheelGeometry`, `cars`, `makeCar` |
| `car physics`, `particles…`, `skid marks`, `damage`, `people physics` | Driving physics, smoke and sparks, crashes | `crash` |
| `traffic AI`, `pedestrians` | Bot drivers and walkers | `botThink`, `npcThink` |
| `police` (and the subsections on the sjöpolis and navy, the helicopter, police on the ground) | Wanted stars, chases, police boats, military, helicopter, arrests and cells | `limitAt`, `startChase`, `endChase`, `policeThink`, `policeUpdate`, `WATER`, `updateHeli` |
| `initial traffic` | Spawns traffic at start | |
| `Högvakten and the Dalahäst hunt`, `jobs and street races`, `ice cream kiosks and balloon sellers` | Side activities | `JOBS`, `VENDORS` |
| `game state`, `car picker`, `traffic upkeep` | Input state, picking a car, keeping traffic around the player | `keys`, `readInput`, `chooseModel`, `manageTraffic` |
| `simulation step`, `visuals` | One physics step, moving meshes, the camera | `physicsStep`, `animate`, `updateCamera` |
| `HUD`, `minimap`, `the big map` | On-screen text and both maps | `updateHUD`, `drawMap`, `bigmap`, `drawBigmap` |
| `sound` | Synthesised engine sounds and effects | `ENGINE_SOUNDS`, `updateAudio` |
| `input` | Keyboard, touch and the start screen | `startGame` |
| `post-processing` | Graphics quality levels and effects | `POST` |
| `playing with friends` | Multiplayer over WebRTC (PeerJS), with MQTT as fallback. Libraries load only when used. | `MP` |
| `loop` | The main loop, adaptive resolution and the test hooks | `tick`, `frame`, `window.gubbeTest` |

## How the parts depend on each other

- The code runs top to bottom when the page loads. The city is built first, then models, cars and people, then traffic and police. Code that runs at load time can only use what is defined above it, so **keep this order** when moving code.
- The street graph (`nodes`, `edges`) is used by traffic, police, jobs, races and both maps.
- Car physics and `makeCar` are used by the player, traffic, police, boats (`WATER`) and multiplayer.
- `tick` in the `loop` section calls everything once per frame: input, AI, physics steps, police, helicopter, jobs, vendors, camera, HUD, maps and sound.
- Multiplayer (`MP`) reads the player, `MODEL` and `makeCar` to show friends and their cars.

## Adding a car (the most common request)

Add one object to the `MODELS` array in the `vehicles` section, copying a similar car. Important fields:

- `id` (unique), `name` (real model name), `kind` and `def` (Swedish type and Swedish definite-form nickname, e.g. `'Golfen'`)
- Size and performance: `W`, `L`, `R` (wheel radius), `wb` (wheelbase), `max` (top speed m/s), `zero`, `brake`, `mass`, `grip`
- `colors`, `gears`, `idle`, `red`, `eng` (must be a key in `ENGINE_SOUNDS`), `rim`
- `shape`: the body lines; the comment above `MODELS` explains every field
- Flags: `sport`, `ev`, `bus`, `moped`, `boat`, `police`, `mil`. Everything except police and military vehicles is on the car picker's normal pages (`PICKABLE`). Police and military vehicles are on the picker's secret page (B twice, or a double tap on its heading), built from `SECRET`.

Then mention the car in `README.md` if it lists similar cars.

## Testing

`window.gubbeTest` (end of the script) lets code drive the game without a player: `start()`, `run(seconds)`, `key(code, down)`, `press(code)`, `teleport(x, z)`, `choose(id)`, `showroom(ids, x, z, gap)` (builds cars side by side), `shot(...)` (fixed-camera screenshot), `info()` (render stats), `mapProblems()` (landmarks standing on streets; should not grow), `engineSample(...)` (measures an engine sound).

Until the smoke test from PR 2 in `PLAN.md` exists, load the page in a headless browser after each change, call `gubbeTest.start()` and `gubbeTest.run(10)`, and check that the console has no errors.

## Working rules

- One Claude session at a time on this repo. Parallel sessions editing the same big file cause merge conflicts.
- While splitting the file (`PLAN.md`), move code **without changing it**. Only change what is needed for it to work in its new file. Note bugs and clean-up ideas under "Saker att fixa senare" in `PLAN.md` instead of fixing them.
- Keep changes small and focused. Don't refactor or "tidy up" code that the task doesn't touch.
- The game must keep working when `index.html` is opened directly from disk (`file://`). Don't introduce ES modules or a build step.
