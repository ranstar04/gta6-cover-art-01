# Vice Cover Studio — GTA-style cover art maker

[![make.fun · gta6-cover-art-01](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/ranstar04/gta6-cover-art-01/rank.svg)](https://make.fun/bounty/gta6-cover-art-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/ranstar04/gta6-cover-art-01/reward.svg)](https://make.fun/bounty/gta6-cover-art-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-cover-art-01)

An entry for the [make.fun bounty **gta6-cover-art-01 — Make GTA 6 Cover Art**](https://make.fun/bounty/gta6-cover-art-01) ($250, top 50).

**Try make.fun with my referral:** https://make.fun/r/dn9c31df

Vice Cover Studio turns your own photo and a caption into GTA-style poster cover art — the multi-panel poster look with bold caption lettering and a Vice City sunset or neon colour grade — and exports it as a PNG to share. It runs **offline in a desktop browser from its own static files**: your photos never leave your machine, there is no upload, no account and no watermark.

## How to use it

1. Serve the app locally (any static server works — no build step):
   ```sh
   node serve.ts
   ```
   then open http://localhost:8080 in desktop Chrome.
2. **Add your photos** (or start from the two included sample photos), pick a photo for each panel, drag the preview to move a photo inside its panel and use the zoom slider to crop it.
3. Pick a **layout** (Triptych poster, Duo split, Single hero, Four grid), a **colour grade** (Vice Sunset, Neon Nights, Palm Dusk, Mono Noir), and write your **caption** — title, subtitle, position and title colour.
4. Pick an **export size** — Square 1080 × 1080, Portrait 1080 × 1350 or Landscape 1920 × 1080 — then press **Export PNG**. Three steps from a photo to a PNG.

## What it does

- **Any photo:** load as many of your own photos as you like (file picker or drag-and-drop), fill several panels with one photo or several, and crop/position each panel's photo separately.
- **The art:** slanted multi-panel poster layouts, bold outlined caption lettering on a slanted sunset bar, colour-grade washes, palm silhouettes, film grain and a vignette — all drawn on canvas, in an original design.
- **Fast and easy:** live preview on every change, one click to export a PNG at the common post sizes.
- **Offline and private:** every script, style, image and font the app loads is a file under `app/` (system fonts only) or a `data:` URI. No network request is ever made.

## Files

- `main.ts` — the program (Node 22, stdlib only): copies `app/` and `screenshots/` to the output directory and writes `dossier.json` with the vendored make.fun library. Run it with `MAKEFUN_OUTPUT_DIR=out node main.ts`.
- `vendor/makefun-app.ts` — the kit's library, copied unchanged.
- `app/index.html`, `app/style.css` — the editor shell.
- `app/src/cover.js` — the cover renderer: `drawCoverArt`, `panelShapes`, `drawPanelPhoto`, `applySunsetGrade`, `applyNeonGrade`, `drawBoldCaption`, `drawPalmSilhouettes`, `drawGrainVignette`, `exportCoverPNG`.
- `app/src/main.js` — the editor: `loadUserPhotos`, `selectPanel`, `panPhotoByDrag`, `zoomPhotoSlider`, `setLayoutPreset`, `setColourGrade`, `setCaptionTitle`, `setCaptionSubtitle`, `setExportSize`, `renderLivePreview`.
- `app/samples/` — two sample photos, made for make.fun with an image model and free to use.
- `screenshots/` — 3–4 screenshots: the exported cover first, then the editor at work.
- `shots.json` — the deterministic screenshot queries (`?shot=cover` / `?shot=editor`) used to take them.
- `serve.ts` — a tiny static server for local testing.

## Originality

Everything here is original: no Rockstar Games logo, wordmark, official artwork, character or font file is used anywhere. The sample photos were made for make.fun with an image model and are free to use.

## License

MIT — see [LICENSE](LICENSE).
