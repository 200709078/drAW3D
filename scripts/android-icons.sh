#!/usr/bin/env bash
# Android simgelerini ve açılış ekranını public/img/app-icon.png'den üretir (ImageMagick 7).
# Çıktılar android/ altında depoya girer; simge değişince yeniden çalıştırın:
#   bash scripts/android-icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."
icon=public/img/app-icon.png
res=android/app/src/main/res
background='#FFFFFF'

# Eski Android sürümleri: tam kare simge; yuvarlak maske isteyenler için daire kırpılmış.
declare -A launcher=([mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192)
for density in "${!launcher[@]}"; do
  size=${launcher[$density]}
  magick "$icon" -resize "${size}x${size}" "$res/mipmap-$density/ic_launcher.png"
  magick "$icon" -resize "${size}x${size}" \
    \( -size "${size}x${size}" xc:none -fill white -draw "circle $((size / 2)),$((size / 2)) $((size / 2)),0" \) \
    -compose CopyOpacity -composite "$res/mipmap-$density/ic_launcher_round.png"
  # Uyarlanabilir simge: 108 dp tuvalin ortadaki 72 dp'sine konur, kenarlar maskede kesilir.
  canvas=$((size * 108 / 48))
  inner=$((size * 72 / 48))
  magick -size "${canvas}x${canvas}" "xc:$background" \( "$icon" -resize "${inner}x${inner}" \) \
    -gravity center -composite "$res/mipmap-$density/ic_launcher_foreground.png"
done
sed -i "s|<color name=\"ic_launcher_background\">.*</color>|<color name=\"ic_launcher_background\">$background</color>|" \
  "$res/values/ic_launcher_background.xml"

# Açılış ekranı (Android 11 ve öncesi): düz arka plan, ortada simge.
for file in "$res"/drawable*/splash.png; do
  read -r width height < <(magick identify -format '%w %h\n' "$file")
  side=$(( (width < height ? width : height) * 2 / 5 ))
  magick -size "${width}x${height}" "xc:$background" \( "$icon" -resize "${side}x${side}" \) \
    -gravity center -composite "$file"
done
echo "Android simgeleri ve açılış ekranı üretildi."
