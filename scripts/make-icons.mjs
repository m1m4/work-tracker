// Generates the PWA icons so they are reproducible rather than binary blobs
// with no source. Run with `npm run icons`.
//
// The mark is a clock and a pencil - hours, and logging them - drawn in the
// app's own palette and given the same treatment as its cards: flat fills, a
// thick ink outline and a hard ink shadow, on lime.
//
// Shapes are signed distance fields in unit space (0..1 across the icon), which
// makes outlines and antialiasing fall out for free: expanding a shape by the
// outline width is just subtracting from its distance, and coverage is that
// distance clamped across one pixel. Rasterised into an RGBA buffer and written
// as a PNG with Node's zlib, so there is no image dependency.

import { deflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'public')

// Kept in step with styles.css.
const LIME = [212, 242, 79]
const INK = [22, 19, 15]
const CREAM = [255, 253, 248]
const AMBER = [255, 191, 73]
const PINK = [255, 122, 168]

// The mark is composed in a comfortable design space and then shrunk about the
// centre. Android crops a maskable icon to a circle (or a squircle, depending on
// the launcher), and artwork that merely scrapes inside the safe zone sits
// tangent to that edge and reads as cropped even when it technically is not.
const SCALE = 0.86

const OUTLINE = 0.021 * SCALE // ink border around each shape
const SHADOW = 0.026 * SCALE // hard offset, down and to the right

// The spec guarantees only a circle of radius 0.4 from the centre survives the
// crop. MAX_REACH is deliberately well inside that, to leave a visible ring of
// background all the way round rather than to scrape past the limit.
const SAFE_RADIUS = 0.4
const MAX_REACH = 0.35

// --- signed distance fields, all in unit space ------------------------------

function sdCircle(p, centre, radius) {
  return Math.hypot(p[0] - centre[0], p[1] - centre[1]) - radius
}

/** Capsule: distance to a segment, minus a half-width. Used for the hands. */
function sdSegment(p, a, b, halfWidth) {
  const px = p[0] - a[0]
  const py = p[1] - a[1]
  const bx = b[0] - a[0]
  const by = b[1] - a[1]
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)))
  return Math.hypot(px - bx * t, py - by * t) - halfWidth
}

/** Rotated rectangle, given its centre, half-extents and angle in radians. */
function sdBox(p, centre, halfLength, halfWidth, angle) {
  const cos = Math.cos(-angle)
  const sin = Math.sin(-angle)
  const dx = p[0] - centre[0]
  const dy = p[1] - centre[1]
  const qx = Math.abs(dx * cos - dy * sin) - halfLength
  const qy = Math.abs(dx * sin + dy * cos) - halfWidth
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

/**
 * Exact distance to a triangle.
 *
 * The cheap version - the intersection of three half-planes - is wrong outside
 * the shape near a vertex, and that matters here because the outline is drawn by
 * offsetting the shape. At the pencil's sharp point the mitre runs away and
 * throws a long ink spike past the tip. True distance gives a slightly rounded
 * corner instead, which is what a sharpened pencil looks like anyway.
 */
function sdTriangle(p, a, b, c) {
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1]]
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1]
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0]

  const edges = [sub(b, a), sub(c, b), sub(a, c)]
  const offsets = [sub(p, a), sub(p, b), sub(p, c)]
  // Winding, so the inside test works whichever way the vertices were given.
  const winding = Math.sign(cross(edges[0], sub(a, c)))

  let squared = Infinity
  let inside = Infinity
  for (let i = 0; i < 3; i++) {
    const t = Math.max(0, Math.min(1, dot(offsets[i], edges[i]) / dot(edges[i], edges[i])))
    const nearest = [offsets[i][0] - edges[i][0] * t, offsets[i][1] - edges[i][1] * t]
    squared = Math.min(squared, dot(nearest, nearest))
    inside = Math.min(inside, winding * cross(offsets[i], edges[i]))
  }
  return -Math.sqrt(squared) * Math.sign(inside)
}

// --- the mark ---------------------------------------------------------------

const CLOCK = { centre: [0.42, 0.41], radius: 0.228 }

// Pencil axis, running from the eraser up to the point.
const TAIL = [0.55, 0.795]
const POINT = [0.795, 0.55]
const PENCIL_HALF_WIDTH = 0.046

function buildShapes() {
  const axisX = POINT[0] - TAIL[0]
  const axisY = POINT[1] - TAIL[1]
  const length = Math.hypot(axisX, axisY)
  const ux = axisX / length
  const uy = axisY / length
  const angle = Math.atan2(uy, ux)
  // Perpendicular, for the two corners where the tip meets the body.
  const perpX = -uy
  const perpY = ux

  const along = (from, distance) => [from[0] + ux * distance, from[1] + uy * distance]

  const tipLength = length * 0.3
  const eraserLength = length * 0.17
  const bodyLength = length - tipLength - eraserLength

  const neck = along(TAIL, eraserLength + bodyLength)
  const eraserCentre = along(TAIL, eraserLength / 2)
  const bodyCentre = along(TAIL, eraserLength + bodyLength / 2)

  const corner = (sign) => [
    neck[0] + perpX * PENCIL_HALF_WIDTH * sign,
    neck[1] + perpY * PENCIL_HALF_WIDTH * sign,
  ]

  return [
    // Clock face, then its hands. The hands are already ink, so they take no
    // outline - it would only thicken them.
    { sdf: (p) => sdCircle(p, CLOCK.centre, CLOCK.radius), fill: CREAM, silhouette: true },
    {
      sdf: (p) => sdSegment(p, CLOCK.centre, [CLOCK.centre[0], CLOCK.centre[1] - 0.125], 0.023),
      fill: INK,
      outline: 0,
    },
    {
      sdf: (p) =>
        sdSegment(p, CLOCK.centre, [CLOCK.centre[0] + 0.101, CLOCK.centre[1] + 0.051], 0.023),
      fill: INK,
      outline: 0,
    },

    // Pencil, tail first so the tip draws over the body.
    {
      sdf: (p) => sdBox(p, eraserCentre, eraserLength / 2, PENCIL_HALF_WIDTH, angle),
      fill: PINK,
      silhouette: true,
    },
    {
      sdf: (p) => sdBox(p, bodyCentre, bodyLength / 2, PENCIL_HALF_WIDTH, angle),
      fill: AMBER,
      silhouette: true,
    },
    { sdf: (p) => sdTriangle(p, corner(1), corner(-1), POINT), fill: CREAM, silhouette: true },
  ]
}

// --- PNG encoding -----------------------------------------------------------

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

// --- rasteriser -------------------------------------------------------------

function mix(base, over, alpha) {
  if (alpha <= 0) return base
  return [
    Math.round(base[0] * (1 - alpha) + over[0] * alpha),
    Math.round(base[1] * (1 - alpha) + over[1] * alpha),
    Math.round(base[2] * (1 - alpha) + over[2] * alpha),
  ]
}

function drawIcon(size, shapes) {
  const rgba = Buffer.alloc(size * size * 4)
  // Distances are in unit space; scaling to pixels is what keeps the softened
  // edge one pixel wide at every icon size.
  const cover = (distance) => Math.max(0, Math.min(1, 0.5 - distance * size))

  const silhouette = shapes.filter((shape) => shape.silhouette)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = [(x + 0.5) / size, (y + 0.5) / size]
      const shifted = [p[0] - SHADOW, p[1] - SHADOW]

      let colour = LIME

      // One hard shadow for the whole mark, from the union of its outlines.
      const shadow = Math.min(...silhouette.map((shape) => shape.sdf(shifted)))
      colour = mix(colour, INK, cover(shadow - OUTLINE))

      // Then each shape in order: outline, then the fill inside it.
      for (const shape of shapes) {
        const distance = shape.sdf(p)
        const outline = shape.outline ?? OUTLINE
        if (outline > 0) colour = mix(colour, INK, cover(distance - outline))
        colour = mix(colour, shape.fill, cover(distance))
      }

      const at = (y * size + x) * 4
      rgba[at] = colour[0]
      rgba[at + 1] = colour[1]
      rgba[at + 2] = colour[2]
      rgba[at + 3] = 255
    }
  }

  return encodePng(size, size, rgba)
}

/** Furthest the artwork reaches from the centre, including outline and shadow. */
function measureReach(shapes) {
  const steps = 400
  let reach = 0
  for (let y = 0; y <= steps; y++) {
    for (let x = 0; x <= steps; x++) {
      const p = [x / steps, y / steps]
      const shifted = [p[0] - SHADOW, p[1] - SHADOW]
      const inked = shapes.some((shape) => {
        const outline = shape.outline ?? OUTLINE
        if (shape.sdf(p) - outline <= 0) return true
        return shape.silhouette && shape.sdf(shifted) - outline <= 0
      })
      if (inked) reach = Math.max(reach, Math.hypot(p[0] - 0.5, p[1] - 0.5))
    }
  }
  return reach
}

/**
 * Rewrites every reference to the icons with the current content hash.
 *
 * The filenames themselves stay put, but the URLs change whenever the artwork
 * does - which is the only thing that reliably busts an installed app's icon.
 * Android bakes the icon into a WebAPK and iOS caches apple-touch-icon by URL;
 * neither re-fetches a path it has already seen, however the file changes on
 * the server.
 */
function stampReferences(file, hashes) {
  const before = readFileSync(file, 'utf8')
  const after = before.replace(
    /icon-(192|512)\.png(\?v=[a-f0-9]+)?/g,
    (_match, size) => `icon-${size}.png?v=${hashes[size]}`,
  )
  if (after === before) return
  writeFileSync(file, after)
  console.log(`stamped ${file}`)
}

/**
 * Shrinks a shape about the centre of the icon. Uniform scaling of a signed
 * distance field is exact: sample the un-scaled point, then scale the distance
 * back, so outlines and antialiasing stay correct.
 */
function scaleShape(shape) {
  return {
    ...shape,
    sdf: (p) => shape.sdf([0.5 + (p[0] - 0.5) / SCALE, 0.5 + (p[1] - 0.5) / SCALE]) * SCALE,
  }
}

mkdirSync(OUT_DIR, { recursive: true })

const shapes = buildShapes().map(scaleShape)

const reach = measureReach(shapes)
console.log(
  `reach ${reach.toFixed(3)} (target <= ${MAX_REACH}, spec safe radius ${SAFE_RADIUS})`,
)
if (reach > MAX_REACH) {
  console.error('Artwork reaches too close to the mask edge; lower SCALE.')
  process.exit(1)
}

const hashes = {}
for (const size of [192, 512]) {
  const png = drawIcon(size, shapes)
  const file = join(OUT_DIR, `icon-${size}.png`)
  writeFileSync(file, png)
  hashes[size] = createHash('sha256').update(png).digest('hex').slice(0, 8)
  console.log(`wrote ${file}`)
}

stampReferences(join(OUT_DIR, 'manifest.webmanifest'), hashes)
stampReferences(join(ROOT, 'index.html'), hashes)
