#!/usr/bin/env bash
# Bütün uygulama simgelerini public/img/app-icon.svg'den üretir (Inkscape ve ImageMagick 7):
# web (app-icon.png, favicon.png), Linux (build/icons) ve Windows (build/icon.ico) paketleri,
# Android simgeleri ve açılış ekranı. Çıktılar depoya girer; simge değişince yeniden çalıştırın:
#   bash scripts/icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
source=public/img/app-icon.svg

render() { inkscape "$source" -o "$2" -w "$1" -h "$1" > /dev/null 2>&1; }

render 512 public/img/app-icon.png
render 64 public/img/favicon.png
for size in 16 24 32 48 64 128 256 512; do render "$size" "build/icons/${size}x${size}.png"; done
magick build/icons/256x256.png build/icons/128x128.png build/icons/64x64.png build/icons/48x48.png \
  build/icons/32x32.png build/icons/16x16.png build/icon.ico

bash scripts/android-icons.sh
echo "Simgeler public/img/app-icon.svg'den üretildi."
