// Generates the PWA icons so they are reproducible rather than binary blobs
// with no source. Run with `npm run icons`.
//
// The mark is the app's own progress ring given the same treatment as its cards:
// a cream arc with a thick ink outline and a hard ink shadow, on lime. Drawn by
// hand into an RGBA buffer and written as a PNG with Node's zlib, so there is no
// image dependency.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Kept in step with styles.css.
const LIME = [212, 242, 79]
const INK = [22, 19, 15]
const CREAM = [255, 253, 248]

const PROGRESS = 0.72 // fraction of the ring drawn
const TAU = Math.PI * 2

// Geometry as fractions of the icon's edge. The outermost extent is
// RADIUS + STROKE / 2 + OFFSET = 0.376, inside the 0.4 maskable safe radius, so
// Android can crop this to a circle without clipping the mark.
const RADIUS = 0.275
const STROKE = 0.125
const OFFSET = 0.038
const OUTLINE = 0.026 // ink border between the cream fill and the lime ground

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 6 // colour type: RGBA
  // bytes 10-12 stay zero: deflate, adaptive filtering, no interlace

  // Each scanline is prefixed with its filter type (0 = none).
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    const rowStart = y * (width * 4 + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function mix(base, over, alpha) {
  if (alpha <= 0) return base
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
  ]
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const radius = size * RADIUS
  const stroke = size * STROKE
  const offset = size * OFFSET
  const outline = size * OUTLINE
  const end = PROGRESS * TAU

  /**
   * Antialiased coverage of an arc band at a pixel. Every boundary - both radial
   * edges and both butt caps - is reduced to a signed distance in pixels, so the
   * whole shape softens by one pixel and the arc ends come out square rather
   * than stepped. Caps use arc length, not radians, so they soften by the same
   * width as the radial edges regardless of radius.
   */
  function coverage(x, y, shift, inset) {
    const inner = radius - stroke / 2 + inset
    const outer = radius + stroke / 2 - inset
    const dx = x + 0.5 - (centre + shift)
    const dy = y + 0.5 - (centre + shift)
    const distance = Math.hypot(dx, dy)
    if (distance > outer + 1 || distance < inner - 1) return 0

    // Angle measured clockwise from twelve o'clock, matching the app's ring.
    let angle = Math.atan2(dx, -dy)
    if (angle < 0) angle += TAU

    const edge = Math.min(
      distance - inner,
      outer - distance,
      angle * distance - inset,
      (end - angle) * distance - inset,
    )
    return Math.max(0, Math.min(1, edge + 0.5))
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let colour = LIME
      // Hard shadow, then the outline, then the fill inset within it.
      colour = mix(colour, INK, coverage(x, y, offset, 0))
      colour = mix(colour, INK, coverage(x, y, 0, 0))
      colour = mix(colour, CREAM, coverage(x, y, 0, outline))

      const at = (y * size + x) * 4
      rgba[at] = colour[0]
      rgba[at + 1] = colour[1]
      rgba[at + 2] = colour[2]
      rgba[at + 3] = 255
    }
  }

  return encodePng(size, size, rgba)
}

mkdirSync(OUT_DIR, { recursive: true })
for (const size of [192, 512]) {
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, drawIcon(size))
  console.log(`wrote ${file}`)
}
