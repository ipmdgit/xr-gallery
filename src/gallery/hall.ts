import * as THREE from 'three'
import data from '../data/first-light.json'
import { GALLERY, type ArtworkConfig } from './artwork.ts'

/**
 * The First Light exhibition hall: 58 works in 10 rooms (Booklet v10, 13 Nov 2026).
 * One room is built at a time, so a phone only ever holds one room's textures.
 */

export interface Work {
  id: string
  no: number
  title: string
  titleKo: string | null
  student: string
  completedBy: string | null
  /** Shown exactly as the participant made it, with no AI completion (#101). */
  original?: boolean
  image: string
  thumb: string
  aspect: number
}

export interface Room {
  number: number
  name: string | null
  works: Work[]
}

export const EXHIBITION = data.exhibition
export const ROOMS: Room[] = data.rooms as Room[]
export const WORK_COUNT = ROOMS.reduce((n, r) => n + r.works.length, 0)

export function roomLabel(room: Room): string {
  return room.name ? `Room ${room.number} · ${room.name}` : `Room ${room.number}`
}

export function roomIndexOfWork(id: string): number {
  return ROOMS.findIndex((r) => r.works.some((w) => w.id === id))
}

// Usable wall spans, leaving the corners and the open front clear.
const BACK_SPAN = 16 // x from -8 to 8
const SIDE_FRONT = 3.4 // z where the side walls' hang starts, near the entrance
const SIDE_BACK = -5.2 // z where it ends, near the back corners

function hangHeight(n: number): number {
  if (n === 1) return 2.7
  if (n <= 4) return 2.1
  return 1.75
}

/** How many works go on [left, back, right]. Side walls carry equal counts so the room reads symmetric. */
function splitWalls(n: number): [number, number, number] {
  if (n <= 5) return [0, n, 0]
  const side = Math.floor(n * 0.3)
  return [side, n - 2 * side, side]
}

/** Centres along a wall of `span` metres for pieces of the given widths, plus a scale if they do not fit. */
function spread(widths: number[], span: number): { centers: number[]; scale: number } {
  const k = widths.length
  let scale = 1
  let sum = widths.reduce((a, b) => a + b, 0)
  const minGap = 0.45
  if (sum + minGap * (k + 1) > span) {
    scale = (span - minGap * (k + 1)) / sum
    sum *= scale
  }
  const gap = Math.min(1.5, (span - sum) / (k + 1))
  const total = sum + gap * (k - 1)
  let at = -total / 2
  const centers: number[] = []
  for (const w of widths) {
    centers.push(at + (w * scale) / 2)
    at += w * scale + gap
  }
  return { centers, scale }
}

/** Placement for each work in a room, in walking order: left wall front-to-back, back wall, right wall back-to-front. */
export function layoutRoom(room: Room): ArtworkConfig[] {
  const n = room.works.length
  const baseH = hangHeight(n)
  const [nl, nb] = splitWalls(n)
  const left = room.works.slice(0, nl)
  const back = room.works.slice(nl, nl + nb)
  const right = room.works.slice(nl + nb)
  const label = roomLabel(room)
  const out: ArtworkConfig[] = []

  const sideSpan = SIDE_FRONT - SIDE_BACK
  const sideMid = (SIDE_FRONT + SIDE_BACK) / 2

  function push(w: Work, wall: 'left' | 'back' | 'right', along: number, scale: number) {
    const height = baseH * scale
    const width = height * w.aspect
    out.push({
      id: w.id,
      type: 'artwork',
      title: w.title,
      titleKo: w.titleKo,
      artist: w.student,
      student: w.student,
      completedBy: w.completedBy,
      original: w.original === true,
      description: w.original
        ? `Original work by ${w.student}`
        : w.completedBy
          ? `Completed by ${w.completedBy}`
          : '',
      no: w.no,
      image: w.image,
      thumb: w.thumb,
      room: room.number,
      roomLabel: label,
      wall,
      width,
      height,
      y: Math.max(1.75, 0.75 + height / 2),
      ...(wall === 'back' ? { x: along } : { z: along }),
    })
  }

  // Wide works shrink to fit their wall, but a wall's works all share one scale.
  const layoutWall = (works: Work[], span: number) =>
    spread(works.map((w) => baseH * w.aspect), span)

  const l = layoutWall(left, sideSpan)
  // Left wall runs from the entrance (high z) toward the back (low z).
  left.forEach((w, i) => push(w, 'left', sideMid - l.centers[i], l.scale))
  const b = layoutWall(back, BACK_SPAN)
  back.forEach((w, i) => push(w, 'back', b.centers[i], b.scale))
  const r = layoutWall(right, sideSpan)
  // Right wall runs from the back toward the entrance.
  right.forEach((w, i) => push(w, 'right', sideMid + r.centers[i], r.scale))
  return out
}

/** Wall lettering above the back wall: "ROOM 3" over the room's name. */
export function createRoomSign(room: Room): THREE.Mesh {
  const cw = 2048
  const ch = 320
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  if (room.name) {
    ctx.font = '600 58px system-ui, sans-serif'
    ctx.letterSpacing = '22px'
    ctx.fillText(`${EXHIBITION.toUpperCase()}  ·  ROOM ${room.number}`, cw / 2, 80)
    ctx.font = 'italic 400 120px Georgia, serif'
    ctx.letterSpacing = '2px'
    ctx.fillText(room.name, cw / 2, 210)
  } else {
    ctx.font = '600 58px system-ui, sans-serif'
    ctx.letterSpacing = '22px'
    ctx.fillText(EXHIBITION.toUpperCase(), cw / 2, 80)
    ctx.font = 'italic 400 120px Georgia, serif'
    ctx.letterSpacing = '2px'
    ctx.fillText(`Room ${room.number}`, cw / 2, 210)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const width = 8.4
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, (width * ch) / cw),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1, depthWrite: false }),
  )
  mesh.position.set(0, 4.15, -GALLERY.D / 2 + 0.02)
  mesh.name = 'room-sign'
  return mesh
}

let washTexture: THREE.CanvasTexture | null = null

function getWashTexture(): THREE.CanvasTexture {
  if (washTexture) return washTexture
  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size * 0.42, 0, size / 2, size * 0.42, size / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  washTexture = new THREE.CanvasTexture(canvas)
  washTexture.userData.shared = true
  return washTexture
}

/**
 * A soft pool of picture light on the wall behind each work. Real spotlights per work would
 * cost a light each; an additive gradient reads the same and costs one draw.
 */
export function createWash(config: ArtworkConfig): THREE.Mesh {
  const w = (config.width ?? 1.2) * 1.9 + 0.6
  const h = (config.height ?? 1.5) * 1.6 + 0.6
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: getWashTexture(),
      color: 0xfff0d8,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  mesh.name = 'wash'
  const { W, D } = GALLERY
  const y = (config.y ?? 1.85) + 0.15
  switch (config.wall ?? 'back') {
    case 'left':
      mesh.position.set(-W / 2 + 0.015, y, config.z ?? 0)
      mesh.rotation.y = Math.PI / 2
      break
    case 'right':
      mesh.position.set(W / 2 - 0.015, y, config.z ?? 0)
      mesh.rotation.y = -Math.PI / 2
      break
    default:
      mesh.position.set(config.x ?? 0, y, -D / 2 + 0.015)
  }
  return mesh
}

/** Start the browser fetching a room's images so stepping into it is instant. */
export function prefetchRoom(room: Room | undefined): void {
  if (!room) return
  for (const w of room.works) {
    const img = new Image()
    img.decoding = 'async'
    img.src = w.image
  }
}
