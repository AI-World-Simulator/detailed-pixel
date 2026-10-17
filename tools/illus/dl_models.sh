#!/bin/bash
# Approach C models: Wan 2.2 TI2V-5B (bf16/fp16 only: fp8 weights cannot be cast to bf16 on MPS). sha256-verified, resumable.
# Same scheme as ~/ComfyUI/user/downloads/dl_all.sh (aria2 x12, HF paths-info sha256), marks in ~/ComfyUI/user/downloads/verified.
#   nohup caffeinate -i bash tools/illus/dl_models.sh >> tools/illus/raw/dl.log 2>&1 &
set -uo pipefail
M="$HOME/ComfyUI/models"; CONNS=12
FILES=(
  "Comfy-Org/Wan_2.2_ComfyUI_Repackaged|split_files/vae/wan2.2_vae.safetensors|vae/wan2.2_vae.safetensors"
  "Comfy-Org/Wan_2.2_ComfyUI_Repackaged|split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors|diffusion_models/wan2.2_ti2v_5B_fp16.safetensors"
  "Comfy-Org/Wan_2.1_ComfyUI_repackaged|split_files/text_encoders/umt5_xxl_fp16.safetensors|text_encoders/umt5_xxl_fp16.safetensors"
)
log() { echo "[$(date '+%m-%d %H:%M:%S')] $*"; }
fsize() { stat -f %z "$1" 2>/dev/null || echo 0; }
info() {
  curl -s -m 30 "https://huggingface.co/api/models/$1/paths-info/main" -X POST -H 'Content-Type: application/json' \
    -d "{\"paths\":[\"$2\"]}" | python3 -c 'import sys,json; d=json.load(sys.stdin)[0]; print(d["lfs"]["oid"], d["size"])'
}
# ONLY=<file name> downloads just that file (run two instances to use more connections; the HF CDN caps each one)
for f in "${FILES[@]}"; do
  IFS='|' read -r repo src rel <<<"$f"
  [ -n "${ONLY:-}" ] && [ "$(basename "$rel")" != "$ONLY" ] && continue
  out="$M/$rel"; name=$(basename "$rel"); mark="$HOME/ComfyUI/user/downloads/verified/$name"
  i=$(info "$repo" "$src") || { log "FAILED $name: no metadata"; continue; }
  sha=${i% *}; size=${i#* }
  if [ "$(cat "$mark" 2>/dev/null)" = "$sha $(fsize "$out")" ]; then log "OK     $name (verified earlier)"; continue; fi
  if [ ! -f "$out" ]; then
    log "start  $name ($(( size / 1000000 )) MB)"; t0=$(date +%s); tries=0
    while [ "$(fsize "$out.part")" -lt "$size" ] || [ -f "$out.part.aria2" ]; do
      aria2c -c -x $CONNS -s $CONNS -k 16M --max-tries=0 --retry-wait=10 --timeout=60 --connect-timeout=20 \
        --lowest-speed-limit=10K --file-allocation=none --auto-file-renaming=false --allow-overwrite=false \
        --console-log-level=error --summary-interval=0 --download-result=hide \
        -d "$(dirname "$out")" -o "$name.part" "https://huggingface.co/$repo/resolve/main/$src" >/dev/null 2>&1
      [ ! -f "$out.part.aria2" ] && [ "$(fsize "$out.part")" -ge "$size" ] && break
      tries=$((tries + 1)); [ $tries -gt 200 ] && { log "FAILED $name"; continue 2; }; sleep 20
    done
    mv "$out.part" "$out"; log "got    $name in $(( $(date +%s) - t0 ))s"
  fi
  got=$(shasum -a 256 "$out" | cut -d' ' -f1)
  if [ "$got" = "$sha" ]; then echo "$sha $(fsize "$out")" > "$mark"; log "OK     $name (sha256 verified)"
  else mv "$out" "$out.bad"; log "BADSHA $name"; fi
done
log "ALL DONE"
