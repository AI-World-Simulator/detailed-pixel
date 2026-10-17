# Sprite lab: building sprites with local ComfyUI (Z-Image-Turbo + Qwen-Image-2.1)

Research scripts from the 2026-10-16/17 night experiments. Findings and pictures: `reports/Спрайты зданий из ИИ.md`.
Server: `~/ComfyUI/start.sh` (see `~/ComfyUI/LOCAL_SETUP.md`). All scripts talk to http://127.0.0.1:8188 and read/write
`~/ComfyUI/input` and `~/ComfyUI/output`. Run them with `~/ComfyUI/.venv/bin/python` from this folder.

| Script | What it does |
|---|---|
| `proxy2.py OUT ANGLE [hip\|gable\|flat] [oblique\|iso] [tall]` | Massing proxy of one building at one angle: `_color`, `_colorn` (with grain, for img2img), `_gray`, `_lines` (silhouette + roof edges), `_linesw` (+ windows), `_depth`, `_mask`, `_faces`. Size via env: `PL` front width, `PD` depth, `PFL` floors, `PFH` floor height, `PRIDGE` roof rise, `PAXIS` u (ridge along the street) / n (front gable), `PTAG` file tag. Angle 0 = front door faces the viewer, growing angle turns the front left (same as `../angle_sheet.py`). |
| `sheet_proxy.py IN NAME COLS CELL ANGLES…` | Tiles single-view proxies into one turnaround sheet with a common scale (`PAT` env = file stem pattern, e.g. `p{a}_gable_iso_t_izba`). |
| `make_bproxies.sh` | Proxies + 13-view sheets (0–180° step 15) for the six simple reference houses. |
| `exp.py ROUND` | Z-Image-Turbo + Fun ControlNet experiment rounds (`ROUNDS` inside), contact sheets with IoU / light scores. `wf()` builds the API workflow. |
| `qexp.py ROUND` + `qrounds.py` | Same for Qwen-Image-2.1 (turbo LoRA, references, RGBA, Fun ControlNet, img2img). `FRONT=1` puts jobs at the head of the queue. |
| `zbeauty.py` | Second pass: Z-Image img2img from a Qwen result + proxy window lines → detail and storybook look, shape kept. |
| `zbeauty_sheet.py QWEN_SHEET TAG "desc" PREFIX [d] [s]` | The same second pass over a whole Qwen turnaround sheet. |
| `fix_cells.py SHEET PROXY CELL COLS "c,r …" SEED PREFIX` | Regenerate only broken cells of a sheet (inpainting with the sheet as context), untouched cells stay pixel-identical. |
| `qscore.py IMG MASK` | Silhouette IoU of a result vs the proxy mask (alpha or background colour). |
| `commons_fetch.py OUT` | Reference photos from Wikimedia Commons (free licences) + `attribution.json`. |
| `block_dump.js CITY CX CY HALF OUT.json` | A window of a schema city from the generator (node): buildings with rects, roofs, colours, doors; streets with widths; block faces; trees and street props. |
| `block_types.py [types]` | Proxies of the block's building types (hip/gable/flat × 4/6 floors, 5 bays of 3.25 m) at the exact 8 view angles of the district, tiled into 4×2 sheets with `_umap` and projection metadata. |
| `block_assets.py gen\|post\|regen OUT` | Trees, bushes, lamp, bench, kiosk as cut-out sprites and seamless ground textures in the chosen clay style (Z-Image text-to-image). |
| `block_build.py RAW OUT_SET TYPE=sheet[,sheet] assets=DIR [alias=a:b]` | Assembles the block: per-cell alignment of the sheet to the proxy, buildings stretched by repeating the middle bay, per-face recolour, draw order, textured ground with shadows, `block.js` for `experiments/moscow-block/`. |
| `block_pick.py ROUND_PREFIX [min_iou]` | Scores generated type sheets per cell against the proxies and prints the `TYPE=sheet,...` arguments for `block_build.py` (both seeds when both are good). |
| `block_pack.py SET_DIR [quality]` | Shrinks a built set for the repository: sprites and ground to WebP (q60 ≈ 10× smaller than PNG), coordinates in `block.js` rounded, build-only textures dropped. |
| `codex_prompts/` | Codex (GPT Image) prompts that worked: single view and 8-view sheet from the colour proxy, photo → sprite, edits, character, textures, neutral-colour type sheets. |

Related tools one level up: `angle_sheet.py` (guide sheets for ChatGPT), `measure_sheet.py` (angles + camera pitch of a generated sheet),
`cut_sheet.py` (sheet → per-angle RGBA sprites + mirrored angles + `sprites.json`).

Note: paths inside the scripts point to the ComfyUI folders; contact sheets land next to the scripts (`exp/`, `qexp/`).
