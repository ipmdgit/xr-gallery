import * as THREE from 'three'
import type { ArtworkConfig } from './artwork.ts'

/**
 * Texture budget for the wall art.
 *
 * Each piece holds the resolution the screen needs. Every work starts on its 320 px thumb, loaded
 * before the work is returned, so a piece is never blank. When a piece is in view (or just outside
 * it) and drawn bigger than about 65% of the thumb on screen, its 1024 px texture loads. Below that
 * size the GPU would only sample the 1024 px texture's smaller mip levels anyway, so the thumb
 * looks the same. When a piece is off screen or small again for a few seconds, the 1024 px texture
 * is freed. Only a few load at once, the biggest visible pieces first. In VR every piece in the
 * room gets its full texture, since the headset's view is not this camera's.
 *
 * Integration, one line in each file:
 *   artwork.ts, createArtwork:  config.image ? await artTexture(config, () => loadTexture(config.image!, fallback)) : fallback
 *   main.ts, after the camera:  installTextureCache(renderer, scene, camera)
 */

/** Full textures loading at the same time. */
const MAX_CONCURRENT = 3
/** Load the full texture when the piece's long edge is drawn bigger than this share of the thumb's. */
const UP = 0.65
/** Keep it until the piece shrinks below this share, so it does not flip back and forth. */
const DOWN = 0.5
/** How long a full texture is kept after it stops being wanted, so a quick look back is free (ms). */
const HOLD_MS = 4000
/** The wider frustum: the camera's field of view times this, so textures load before they are seen. */
const VIEW_MARGIN = 1.6
const TICK_MS = 150

type State = 'thumb' | 'queued' | 'loading' | 'full'

interface Entry {
  texture: THREE.Texture
  fullUrls: string[]
  thumbImage: HTMLImageElement | null
  /** The thumb's long edge in pixels. */
  thumbEdge: number
  fullImage: HTMLImageElement | null
  state: State
  /** Last time the piece was drawn big enough to want its full texture. */
  wantedAt: number
  priority: number
}

const entries = new Map<THREE.Texture, Entry>()
const imageLoader = new THREE.ImageLoader()
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let active = 0
let internalDispose = false
let peakFull = 0
let peakFullBytes = 0

const pad = (n: number) => String(n).padStart(3, '0')

function load(urls: string[]): Promise<HTMLImageElement | null> {
  const [url, ...rest] = urls
  if (!url) return Promise.resolve(null)
  return imageLoader.loadAsync(url).catch(() => load(rest))
}

/** Swap the image on the same texture, so the material keeps its map. Frees the old GPU copy. */
function setImage(entry: Entry, image: CanvasImageSource) {
  internalDispose = true
  entry.texture.dispose()
  internalDispose = false
  entry.texture.image = image
  entry.texture.needsUpdate = true
}

/** GPU bytes for a texture with mipmaps: width x height x 4 x 4/3. */
function gpuBytes(image: { width: number; height: number } | null): number {
  return image ? Math.round((image.width * image.height * 4 * 4) / 3) : 0
}

/**
 * The wall texture for a work. Resolves once the thumb is ready, so the piece is textured from its
 * first frame. If there is no thumb at all, it uses `oldLoad`, the way textures loaded before.
 */
export async function artTexture(
  config: ArtworkConfig,
  oldLoad: () => Promise<THREE.Texture>,
): Promise<THREE.Texture> {
  const prepared = config.no !== undefined ? `artwork/${pad(config.no)}` : null
  const thumbUrls = [prepared && `${prepared}-thumb.webp`, config.thumb].filter(Boolean) as string[]
  const fullUrls = [prepared && `${prepared}.webp`, config.image].filter(Boolean) as string[]

  const thumb = await load(thumbUrls)
  if (!thumb) return oldLoad() // no thumb: load the full image the old way, unmanaged

  const texture = new THREE.Texture(thumb)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  const entry: Entry = {
    texture,
    fullUrls,
    thumbImage: thumb,
    thumbEdge: Math.max(thumb.width, thumb.height),
    fullImage: null,
    state: 'thumb',
    wantedAt: 0,
    priority: Infinity,
  }
  entries.set(texture, entry)
  // The room disposes its textures when it is taken down; forget the entry then.
  texture.addEventListener('dispose', () => {
    if (internalDispose) return
    entries.delete(texture)
    if (entry.state === 'full') entry.fullImage = null
  })
  scheduleTick()
  return texture
}

function startLoad(entry: Entry) {
  entry.state = 'loading'
  active++
  void load(entry.fullUrls).then((image) => {
    active--
    if (!entries.has(entry.texture)) return // the room went away while it loaded
    if (!image) {
      entry.state = 'thumb'
      entry.fullUrls = [] // nothing to load; stay on the thumb
      return
    }
    entry.fullImage = image
    entry.state = 'full'
    setImage(entry, image)
    countFull()
    pump()
  })
}

function pump() {
  const queued = [...entries.values()].filter((e) => e.state === 'queued').sort((a, b) => a.priority - b.priority)
  for (const e of queued) {
    if (active >= MAX_CONCURRENT) break
    startLoad(e)
  }
}

function countFull() {
  let n = 0
  let bytes = 0
  for (const e of entries.values()) {
    if (e.state !== 'full') continue
    n++
    bytes += gpuBytes(e.fullImage)
  }
  peakFull = Math.max(peakFull, n)
  peakFullBytes = Math.max(peakFullBytes, bytes)
}

const frustum = new THREE.Frustum()
const wideFrustum = new THREE.Frustum()
const projScreen = new THREE.Matrix4()
const wideCam = new THREE.PerspectiveCamera()
const sphere = new THREE.Sphere()
const camPos = new THREE.Vector3()
const bufferSize = new THREE.Vector2()
const worldScale = new THREE.Vector3()

function tick() {
  if (!renderer || !scene || !camera || entries.size === 0) return
  const now = performance.now()

  // Which mesh shows each managed texture right now. A work not in the scene has no mesh.
  const meshOf = new Map<THREE.Texture, THREE.Mesh>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    const map = (mesh.material as THREE.MeshBasicMaterial | undefined)?.map
    if (map && entries.has(map) && mesh.visible) meshOf.set(map, mesh)
  })

  camera.updateMatrixWorld()
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
  frustum.setFromProjectionMatrix(projScreen)
  wideCam.copy(camera)
  wideCam.fov = Math.min(170, camera.fov * VIEW_MARGIN)
  wideCam.aspect = camera.aspect
  wideCam.updateProjectionMatrix()
  projScreen.multiplyMatrices(wideCam.projectionMatrix, camera.matrixWorldInverse)
  wideFrustum.setFromProjectionMatrix(projScreen)
  camera.getWorldPosition(camPos)
  renderer.getDrawingBufferSize(bufferSize)
  const xr = renderer.xr.isPresenting
  // Screen pixels per metre at 1 m, along the screen's height.
  const pxPerMetre = bufferSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))

  for (const e of entries.values()) {
    const mesh = meshOf.get(e.texture)
    let screenPx = 0
    let inView = false
    if (mesh) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
      mesh.updateWorldMatrix(true, false)
      sphere.copy(mesh.geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld)
      inView = frustum.intersectsSphere(sphere)
      if (inView || wideFrustum.intersectsSphere(sphere)) {
        // The piece's long edge in metres, drawn as if facing the camera at its nearest point.
        const params = (mesh.geometry as THREE.PlaneGeometry).parameters
        mesh.getWorldScale(worldScale)
        const edge = params?.width
          ? Math.max(params.width * worldScale.x, params.height * worldScale.y)
          : sphere.radius * Math.SQRT2
        const dist = Math.max(0.1, sphere.center.distanceTo(camPos) - edge / 2)
        screenPx = (edge / dist) * pxPerMetre
      }
    }
    const holding = e.state !== 'thumb'
    const wanted = mesh !== undefined && (xr || screenPx > e.thumbEdge * (holding ? DOWN : UP))
    if (wanted) e.wantedAt = now
    // Visible pieces first, then the biggest on screen.
    e.priority = (inView ? 0 : 100000) - screenPx

    if (wanted && e.state === 'thumb' && e.fullUrls.length) e.state = 'queued'
    else if (!wanted && e.state === 'queued') e.state = 'thumb'
    else if (!wanted && e.state === 'full' && now - e.wantedAt > HOLD_MS && e.thumbImage) {
      e.state = 'thumb'
      e.fullImage = null
      setImage(e, e.thumbImage)
    }
  }
  pump()
}

let tickPending = false
function scheduleTick() {
  if (tickPending) return
  tickPending = true
  queueMicrotask(() => {
    tickPending = false
    tick()
  })
}

/** Start managing wall textures. Call once, after the scene and camera exist. */
export function installTextureCache(r: THREE.WebGLRenderer, s: THREE.Scene, c: THREE.PerspectiveCamera): void {
  renderer = r
  scene = s
  camera = c
  setInterval(tick, TICK_MS)
  if (import.meta.env.DEV) {
    const w = window as unknown as Record<string, unknown>
    w.__texcache = textureCacheStats
    w.__texcacheReset = resetTextureCachePeaks
  }
}

export interface TextureCacheStats {
  managed: number
  full: number
  loading: number
  queued: number
  fullBytes: number
  thumbBytes: number
  peakFull: number
  peakFullBytes: number
}

export function textureCacheStats(): TextureCacheStats {
  let full = 0
  let loading = 0
  let queued = 0
  let fullBytes = 0
  let thumbBytes = 0
  for (const e of entries.values()) {
    if (e.state === 'full') {
      full++
      fullBytes += gpuBytes(e.fullImage)
    } else {
      thumbBytes += gpuBytes(e.thumbImage)
    }
    if (e.state === 'loading') loading++
    if (e.state === 'queued') queued++
  }
  return { managed: entries.size, full, loading, queued, fullBytes, thumbBytes, peakFull, peakFullBytes }
}

/** Reset the peak counters, for measuring one stretch of time. */
export function resetTextureCachePeaks(): void {
  peakFull = 0
  peakFullBytes = 0
  countFull()
}
