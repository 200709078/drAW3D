export function getRandomColor() {
  const lum = -0.25
  let hex = String(Math.random().toString(16).slice(2, 8).toUpperCase())
    .replace(/[^0-9a-f]/gi, "")

  if (hex.length < 6) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }

  let rgbColor = "#"

  for (let i = 0; i < 3; i++) {
    const channel = parseInt(hex.substr(i * 2, 2), 16)
    const shaded = Math.round(
      Math.min(Math.max(0, channel + channel * lum), 255)
    ).toString(16)

    rgbColor += ("00" + shaded).substr(shaded.length)
  }

  return rgbColor
}
