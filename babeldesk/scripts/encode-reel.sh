#!/usr/bin/env bash
# Encode 9:16 H.264 para IG Reels / TikTok / FB Reels
# Uso: ./scripts/encode-reel.sh input.mp4 data/media/out.mp4
set -euo pipefail
IN="${1:?input}"
OUT="${2:?output}"
ffmpeg -y -i "$IN" -vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920" \
  -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.1 -r 30 -b:v 5M \
  -c:a aac -b:a 128k -ac 2 -movflags +faststart "$OUT"
echo "OK $OUT"
