import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { addGlow } from './glow.ts'

export interface ArtworkConfig {
  id: string
  title: string
  artist: string
  description: string
  reflection?: string
  type: 'artwork'
  colors?: [number, number]
  wall?: 'back' | 'left' | 'right'
  x?: number
  y?: number
  z?: number
  image?: string
  /** Hung size of the image in metres, without frame. Defaults to 1.2 x 1.5. */
  width?: number
  height?: number
  /** First Light catalogue fields. */
  no?: number
  titleKo?: string | null
  student?: string
  completedBy?: string | null
  thumb?: string
  room?: number
  roomLabel?: string
}

export const GALLERY = {
  W: 18,
  H: 5,
  D: 12,
} as const

export interface SculptureConfig {
  id: string
  title: string
  artist: string
  description: string
  reflection?: string
  type: 'sculpture'
  model: string
  scale?: number
  x: number
}

export type GalleryItem = ArtworkConfig | SculptureConfig

export interface SceneConfig {
  items: GalleryItem[]
}

const textureLoader = new THREE.TextureLoader()

export function makeCanvasTexture(title: string, from: number, to: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 640
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
  grad.addColorStop(0, `hsl(${from} 92% 44%)`)
  grad.addColorStop(1, `hsl(${to} 92% 54%)`)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = 'bold 44px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(title.toUpperCase(), canvas.width / 2, canvas.height / 2 + 15)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

async function loadTexture(url: string, fallback: THREE.CanvasTexture): Promise<THREE.Texture> {
  try {
    const tex = await textureLoader.loadAsync(url)
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  } catch {
    return fallback
  }
}

/**
 * Artwork materials ignore tone mapping and fog so a painting shows the colours the artist
 * chose, not the room's grade. The reveal still dims them through this set.
 */
export const artMaterials = new Set<THREE.MeshBasicMaterial>()
let artBrightness = 1

export function setArtBrightness(v: number): void {
  artBrightness = v
  for (const m of artMaterials) m.color.setScalar(v)
}

const FRAME = 0.07
const MAT = 0.045

export async function createArtwork(config: ArtworkConfig): Promise<THREE.Group> {
  const w = config.width ?? 1.2
  const h = config.height ?? 1.5
  const [c0, c1] = config.colors ?? [220, 260]
  const fallback = makeCanvasTexture(config.title, c0, c1)
  const texture = config.image ? await loadTexture(config.image, fallback) : fallback
  texture.anisotropy = 4

  const group = new THREE.Group()
  group.name = config.id
  group.userData = { artwork: true, config }

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(w + 2 * (MAT + FRAME), h + 2 * (MAT + FRAME), 0.06),
    new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.55, metalness: 0.15 }),
  )
  frame.position.z = -0.02
  frame.userData = { artwork: true, config, frame: true }

  // A paper-white mat between frame and image, the way works on paper are hung.
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(w + 2 * MAT, h + 2 * MAT),
    new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.95 }),
  )
  mat.position.z = 0.012
  mat.userData = { artwork: true, config }

  const artMat = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, fog: false })
  artMat.color.setScalar(artBrightness)
  artMaterials.add(artMat)
  const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat)
  art.position.z = 0.016
  art.userData = { artwork: true, config }

  group.add(frame, mat, art)
  addGlow(group, w + 2 * (MAT + FRAME) + 0.18, h + 2 * (MAT + FRAME) + 0.18)
  placeWallArtwork(group, config)
  return group
}

/** Free a room's GPU memory before the next room loads. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    mesh.geometry?.dispose()
    const mats = mesh.material
      ? Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      : []
    for (const m of mats) {
      const basic = m as THREE.MeshBasicMaterial
      artMaterials.delete(basic)
      if (basic.map && !basic.map.userData.shared) basic.map.dispose()
      m.dispose()
    }
  })
}

export function wallNormalOf(config: ArtworkConfig): THREE.Vector3 {
  switch (config.wall ?? 'back') {
    case 'left':
      return new THREE.Vector3(1, 0, 0)
    case 'right':
      return new THREE.Vector3(-1, 0, 0)
    default:
      return new THREE.Vector3(0, 0, 1)
  }
}

function placeWallArtwork(group: THREE.Group, config: ArtworkConfig): void {
  const { W, D } = GALLERY
  const depth = 0.05
  const y = config.y ?? 1.85
  switch (config.wall ?? 'back') {
    case 'left':
      group.position.set(-W / 2 + depth, y, config.z ?? 0)
      group.rotation.y = Math.PI / 2
      break
    case 'right':
      group.position.set(W / 2 - depth, y, config.z ?? 0)
      group.rotation.y = -Math.PI / 2
      break
    case 'back':
    default:
      group.position.set(config.x ?? 0, y, -D / 2 + depth)
      group.rotation.y = 0
  }
}

export async function mountSculpture(
  scene: THREE.Scene,
  config: SculptureConfig,
): Promise<void> {
  const group = new THREE.Group()
  group.userData = { artwork: true, config }

  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.82, 0.72, 24),
    new THREE.MeshStandardMaterial({ color: 0x3a3a46, roughness: 0.5, metalness: 0.4 }),
  )
  plinth.position.y = 0.36
  plinth.castShadow = true
  plinth.receiveShadow = true
  plinth.userData = { artwork: true, config, frame: true }
  group.add(plinth)

  try {
    const gltf = await new GLTFLoader().loadAsync(config.model)
    const model = gltf.scene
    model.scale.setScalar(config.scale ?? 1)
    model.position.y = 1.15
    model.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        child.userData = { artwork: true, config }
      }
    })
    group.add(model)
  } catch (error) {
    console.error(`Failed to load model ${config.model}`, error)
  }

  group.position.set(config.x, 0, 0)
  scene.add(group)
}