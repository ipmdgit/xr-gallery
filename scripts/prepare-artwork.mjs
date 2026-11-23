// npm run artwork [-- --src <folder>] [-- --out <folder>]
//
// Turns the exhibition's source images into web-ready textures:
//   <out>/NNN.webp        long edge 1024 px, for the wall
//   <out>/NNN-thumb.webp  long edge 320 px, for LIST
//   <out>/manifest.json   work number, output path, natural width and height, bytes
// NNN is the work number, read from the source file name (7.jpg, 007.png, work-007.tif all give 007).
// Safe to run again: the same sources always give the same files and the same manifest.

import sharp from 'sharp'
import { readdir, readFile, mkdir, writeFile, stat, unlink } from 'node:fs/promises'
import path from 'node:path'

const WALL_EDGE = 1024
const THUMB_EDGE = 320
const WALL_QUALITY = 90
const THUMB_QUALITY = 76
const SOURCE_TYPES = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.avif'])

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

const srcDir = path.resolve(arg('src', 'public/art/first-light'))
const outDir = path.resolve(arg('out', 'public/artwork'))
const catalogPath = path.resolve('src/data/first-light.json')
const pad = (n) => String(n).padStart(3, '0')
const kb = (b) => (b / 1024).toFixed(1)

// The catalogue says which work numbers exist, so a stray or missing file is caught here.
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'))
const expected = new Set(catalog.rooms.flatMap((r) => r.works.map((w) => w.no)))

const sources = new Map()
for (const name of (await readdir(srcDir)).sort()) {
  if (!SOURCE_TYPES.has(path.extname(name).toLowerCase())) continue
  const digits = path.basename(name, path.extname(name)).match(/(\d+)\D*$/)
  if (!digits) {
    console.warn(`skip ${name}: no work number in the name`)
    continue
  }
  const no = Number(digits[1])
  if (sources.has(no)) throw new Error(`two sources for work ${no}: ${sources.get(no)} and ${name}`)
  sources.set(no, name)
}

const unknown = [...sources.keys()].filter((n) => !expected.has(n))
const missing = [...expected].filter((n) => !sources.has(n))
if (unknown.length) console.warn(`not in the catalogue, written anyway: ${unknown.join(', ')}`)
if (missing.length) console.warn(`in the catalogue but no source image: ${missing.join(', ')}`)

await mkdir(outDir, { recursive: true })

// Earlier output for works that no longer have a source would otherwise linger.
for (const name of await readdir(outDir)) {
  const m = name.match(/^(\d{3})(-thumb)?\.webp$/)
  if (m && !sources.has(Number(m[1]))) await unlink(path.join(outDir, name))
}

async function write(input, edge, quality, file) {
  const { data, info } = await sharp(input)
    .rotate() // follow the camera's orientation flag, then drop it
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .webp({ quality, effort: 6 })
    .toBuffer({ resolveWithObject: true })
  await writeFile(file, data)
  return { width: info.width, height: info.height, bytes: data.length }
}

const works = []
const smallSources = []
for (const no of [...sources.keys()].sort((a, b) => a - b)) {
  const input = path.join(srcDir, sources.get(no))
  const meta = await sharp(input).metadata()
  if (Math.max(meta.width, meta.height) < WALL_EDGE) smallSources.push(`${no} (${meta.width}x${meta.height})`)
  const wall = await write(input, WALL_EDGE, WALL_QUALITY, path.join(outDir, `${pad(no)}.webp`))
  const thumb = await write(input, THUMB_EDGE, THUMB_QUALITY, path.join(outDir, `${pad(no)}-thumb.webp`))
  works.push({
    no,
    path: `artwork/${pad(no)}.webp`,
    width: wall.width,
    height: wall.height,
    bytes: wall.bytes,
    thumb: { path: `artwork/${pad(no)}-thumb.webp`, width: thumb.width, height: thumb.height, bytes: thumb.bytes },
    sourceBytes: (await stat(input)).size,
  })
}

const total = (key) => works.reduce((n, w) => n + key(w), 0)
const manifest = {
  wallLongEdge: WALL_EDGE,
  thumbLongEdge: THUMB_EDGE,
  count: works.length,
  totalBytes: total((w) => w.bytes + w.thumb.bytes),
  works,
}
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

console.log(`\nSource: ${path.relative(process.cwd(), srcDir)}   Output: ${path.relative(process.cwd(), outDir)}\n`)
console.log('  no   wall size    wall KB   thumb size  thumb KB   source KB')
for (const w of works) {
  console.log(
    `  ${pad(w.no)}  ${`${w.width}x${w.height}`.padEnd(11)} ${kb(w.bytes).padStart(8)}   ${`${w.thumb.width}x${w.thumb.height}`.padEnd(10)} ${kb(w.thumb.bytes).padStart(8)}   ${kb(w.sourceBytes).padStart(9)}`,
  )
}
const mb = (b) => (b / 1024 / 1024).toFixed(2)
console.log(`\n${works.length} works, ${works.length * 2} files`)
console.log(`wall   ${mb(total((w) => w.bytes))} MB`)
console.log(`thumb  ${mb(total((w) => w.thumb.bytes))} MB`)
console.log(`total  ${mb(manifest.totalBytes)} MB = ${manifest.totalBytes} bytes  (sources ${mb(total((w) => w.sourceBytes))} MB)`)
if (smallSources.length) console.warn(`\nsmaller than ${WALL_EDGE} px, not enlarged: ${smallSources.join(', ')}`)
