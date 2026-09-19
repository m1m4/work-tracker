// Generates the PWA icons so they are reproducible rather than binary blobs
// with no source. Run with `npm run icons`.
//
// Draws the same progress ring the app shows, rendered by hand into an RGBA
// buffer and written as a PNG with Node's zlib. No image dependency needed.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [79, 107, 237, 255] // --accent
const TRACK = [255, 255, 255, 64]
const RING = [255, 255, 255, 255]
const PROGRESS = 0.68 // fraction of the ring drawn

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

/** Linear interpolation between two premultiplied-free RGBA colours. */
function blend(base, over, alpha) {
  const a = (over[3] / 255) * alpha
  return [
    Math.round(base[0] * (1 - a) + over[0] * a),
    Math.round(base[1] * (1 - a) + over[1] * a),
    Math.round(base[2] * (1 - a) + over[2] * a),
    255,
  ]
}

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const centre = size / 2
  const radius = size * 0.3
  const stroke = size * 0.11
  const inner = radius - stroke / 2
  const outer = radius + stroke / 2

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - centre
      const dy = y + 0.5 - centre
      const distance = Math.hypot(dx, dy)

      let colour = BG

      // Antialias the ring edges over roughly one pixel.
      const edge = Math.min(distance - inner, outer - distance)
      if (edge > -1) {
        const coverage = Math.max(0, Math.min(1, edge + 0.5))

        // Angle measured clockwise from twelve o'clock, matching the app.
        let angle = Math.atan2(dx, -dy)
        if (angle < 0) angle += Math.PI * 2
        const filled = angle <= PROGRESS * Math.PI * 2

        colour = blend(BG, filled ? RING : TRACK, coverage)
      }

      const offset = (y * size + x) * 4
      rgba[offset] = colour[0]
      rgba[offset + 1] = colour[1]
      rgba[offset + 2] = colour[2]
      rgba[offset + 3] = 255
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
