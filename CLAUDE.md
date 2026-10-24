# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

drAW3D is a 3D geometry and net (açınım) app (Three.js, TypeScript + Vite) shipped as a web app and an Electron desktop app (Linux AppImage/deb, Windows NSIS); Android/iOS packaging (Capacitor) comes later. It is the sibling of drAW2D (`../drAW2D`) and shares its shell, toolbar and conventions. The UI, test names, docs (README, `docs/*.md`) and messages are in **Turkish** — keep new user-facing strings and docs in Turkish.

## Commands

Node >= 22.12 (`.nvmrc`: 22).

```bash
npm ci
npm run dev              # Vite dev server
npm run typecheck        # tsc for src/ and for electron/ (tsconfig.electron.json)
npm run build            # typecheck + compile electron shell + vite build → dist/, dist-electron/
npm test                 # Playwright (Chromium, WebGL on SwiftShader); starts Vite on 127.0.0.1:4173
TEST_PREVIEW=1 npm test  # same tests against built dist/ via vite preview (run build first)
npx playwright test tests/app-tools.spec.ts               # single file
npx playwright test -g "açınım"                           # single test by title
npm run electron:dev     # Electron against the Vite dev server
npm run test:electron    # build, then open the app from file:// and check it (needs a graphical session)
npm run dist:linux | dist:win
```

## Architecture

Dependencies point one way: `geometry` → `document` → `rendering` / `app` → `ui`. `geometry/` and `document/` know nothing about the DOM or Three.js; geometry code must not depend on Electron either.

- `src/geometry/`: `vec3.ts` plain `{x,y,z}` vectors and ray helpers. `types.ts` the object models: plain structured-cloneable data referencing other objects by ID (`points`, `constraint.ownerId`, `ownerId` for helpers). Optional fields (`hidden`, `geometryValid: false`, style fields) are absent by default so reverting restores the exact graph. `solids.ts` computes shapes from positions (line, plane, angle, sphere, prism/pyramid from base edge AB + side point C + side count + height, cylinder/cone from base center + rim point + height), `maxUnfoldAngle`, areas and volumes. `parts.ts`: every shape has an ordered list of parts (edges = curves, faces = surfaces) with their own parameter space (`position`, `project`, `tangents`, `samples`, `fromRay`); a point on an object stores only `{ ownerId, part, params }`. `unfold.ts` builds nets as pure data: polyhedron faces turn around base edges; the cylinder/cone side bends flat (curvature/half angle change, arc length kept). `tests/geometry-unfold.spec.ts` checks flatness, area and edge-length invariants — keep it passing.
- `src/document/`: `geometry-document.ts` (same core as drAW2D) owns membership, selection, monotonic IDs (never reused), drafts (half-finished tool drawings) and bounded undo/redo via full-graph snapshots plus a cursor; `graph-equality.ts` keeps no-op edits out of history. `dependencies.ts` `resolveDocument` recomputes positions and shapes in document order (creation order is topological) and returns the shape map; undefined geometry keeps its last values with `geometryValid: false` and recovers. A point whose part disappeared (fewer sides) moves to the nearest part. `planDeletion` removes helpers and dependents; free points a construction created for itself survive if something else uses them. `constructions.ts` builds every construction (`buildConstruction`) including a solid's helpers: side point C, base edge segment, the purple height point (`constraint.type === 'height'`), gray locked vertices (`'vertex'`, keyed by role + index, see `vertexSlots`). `editing.ts`: delete/hide/show-all rules, `setSideCount` (adds/removes vertex points; used ones are kept, undefined), `selectionTarget` (helpers select their owner).
- `src/rendering/`: `scene-sync.ts` reconciles one view per object ID (created once, updated in place, disposed on removal); `views.ts` draws each shape kind with shared unit geometries; `materials.ts` caches materials by color; labels (angle degrees) are HTML (`labels.ts`); `frame-renderer.ts` coalesces redraws into one `requestAnimationFrame` — the scene is drawn only on changes and while the camera's damping glides, never continuously.
- `src/app/app.ts` is the composition root: document, scene, camera, tools, toolbar, buttons, keyboard and pointer input. After any model change call `refresh()` (resolve → sync scene → controls/buttons → request a frame). Pointer input: a capture-phase `pointerdown` decides per press whether one finger / the left button may turn the camera (`OrbitControls.mouseButtons.LEFT` / `touches.ONE` set to `null` while a tool or a point drag owns the press); a second finger cancels the tool gesture and OrbitControls pinches. `camera-state.ts` is the single world ↔ canvas mapping (`Projector`) shared by hit testing, dragging and labels.
- `src/app/hit-test.ts`: pixel tolerance (mouse 10, pen 14, touch 22 px). Points win, then the nearest edge/curve unless a surface hides it, then the nearest surface along the pointer ray. Helpers are not pickable themselves (their owner has the same edges).
- `src/app/tools.ts` (`ToolController`): picked points are staged (new ones as document drafts); clicking an object creates a point on it; the finished object comes from `buildConstruction`. Mouse/pen act on press, a touch aims (preview follows) and acts on release. `select-tool.ts`: points before objects; free points drag horizontally (double tap toggles vertical), points on objects slide along their part, height points change the solid's height, vertices are locked; a drag is one history step and Escape reverts it.
- `src/ui/`: `tool-registry.ts` + `main-toolbar.ts` (drAW2D's grouped toolbar, same API; `window.drAW3DToolbar` is the test hook, `#mainToolbar[data-action]` the active tool), `toast.ts`, `title-bar.ts` (drawn only when the Electron preload API exists), `object-controls.ts` (side count and opening sliders; slider input edits in place, release commits).
- `window.drAW3DApp` is a read-only test hook (objects, selection, world → page coordinates, frame count, ground mode).
- `electron/main.ts`: shell only, same pattern as drAW2D (sandboxed, `contextIsolation`, frameless window, `window.drAW3DDesktop.windowControls` over `window:*` IPC). It enables the SwiftShader WebGL fallback for machines without a usable GPU.
- Stylesheets are linked from `index.html`, not imported in TS. `toolbar.css` and `titlebar.css` are drAW2D's files unchanged — app-specific overrides go in `styles.css`. Icons are in `public/img`. Vite `base: './'` so the same build works under `file://`.

## Shared code with drAW2D

`graph-equality.ts`, the core of `geometry-document.ts`, `frame-renderer.ts`, `main-toolbar.ts`, `toast.ts`, `title-bar.ts`, `toolbar.css`, `titlebar.css`, the Electron shell and scripts are copies of drAW2D's modules with the same API (only app names differ). Keep them in step; they will move into one shared package later (roadmap A1: deferred — if it happens, drAW, drAW2D and drAW3D move into one repository together).

## Tests

All tests are Playwright specs in `tests/`. Most import `src/` modules directly and run without a page (`geometry-*`, `document*`, `app-tools`, `frame-renderer`); `app-tools.spec.ts` drives `ToolController`/`SelectController` through fake projectors (`tests/fixtures/top-down.ts`). `app-integration.spec.ts` drives the real app in Chromium (WebGL on SwiftShader) with mouse, CDP touch events and the test hooks. Object colors are random, so tests check models and positions, never screenshots; use deterministic criteria (frame counts) instead of timing.

## Conventions

- Don't try to preserve existing code: rewrite whenever that makes it more efficient, correct or usable; the change must be tested and explained.
- `docs/yol-haritasi.md` lists the planned features and the user's requests — record new requests there with a date and do not implement any item until the user explicitly asks. `docs/ozellik-envanteri.md` is the behavior inventory from before the migration, with intentional changes noted.
- `dist/`, `dist-electron/`, `release/`, `test-results/` are build outputs and not committed.
- Releases: `.github/workflows/release.yml` builds Linux packages on `ubuntu-latest` and the Windows `.exe` on `windows-latest` (never cross-build Windows with wine) and uploads them with `SHA256SUMS.txt` and Turkish notes from `scripts/release-assets.mjs`. A tag `v<package.json version>` creates the release; "Run workflow" rebuilds the current version's assets; `yayinla=false` only builds. Asset names have no version (`drAW3D-linux-amd64.deb`, `drAW3D-linux-x86_64.AppImage`, `drAW3D-win-x64.exe`) so `releases/latest/download/<name>` links stay valid — don't add the version back. New version: `npm version patch`, then `git push --follow-tags` (push a new workflow file before the tag; a tag pushed together with a new workflow did not trigger it). The workflow and script are identical copies in drAW, drAW2D and drAW3D — keep them in step. License: MIT (same as drAW).
