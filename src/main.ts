import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import {
  createArtwork,
  GALLERY,
  setArtBrightness,
  disposeObject,
  wallNormalOf,
  type ArtworkConfig,
  type GalleryItem,
} from './gallery/artwork.ts'
import {
  ROOMS,
  WORK_COUNT,
  EXHIBITION,
  layoutRoom,
  roomLabel,
  createRoomSign,
  createWash,
  prefetchRoom,
} from './gallery/hall.ts'
import { createPlaque } from './gallery/plaque.ts'
import { createInfoCard } from './gallery/infocard.ts'
import { loadTheme, createSettingsUI } from './gallery/settings.ts'
import { updateGlows } from './gallery/glow.ts'
import { createTools, type ToolUI } from './gallery/tools.ts'
import type { ThemeTargets } from './gallery/themes.ts'
import { createSoundscape } from './gallery/sound.ts'
import { installTextureCache } from './gallery/textureCache.ts'
import { createMoodModal, moodById } from './gallery/mood.ts'
import { createWisps } from './gallery/wisps.ts'
import { createJourneyField } from './gallery/journey.ts'

const MOOD_KEY = 'echosphere:mood'
const VISITED_KEY = 'echosphere:visited'

// Every work in the hall, in walking order. Each room is laid out once up front; only the
// current room is ever built in the scene.
const roomLayouts: ArtworkConfig[][] = ROOMS.map(layoutRoom)
const items: ArtworkConfig[] = roomLayouts.flat()
const itemById = new Map(items.map((it) => [it.id, it]))
const indexById = new Map(items.map((it, i) => [it.id, i]))

const FATAL = `
  <div class="fatal">
    <h1>WebGL could not start</h1>
    <p>This gallery renders in real time with WebGL, and your browser refused to create a
    3D context. On Chrome and Edge this is almost always a GPU that has been disabled.</p>
    <ol>
      <li>Fully quit the browser (<b>Cmd+Q</b>) and reopen it &mdash; closing the tab is not enough.</li>
      <li>Check <b>Settings &rarr; System &rarr; Use graphics acceleration when available</b>.</li>
      <li>If that is already on, try <b>chrome://gpu</b> and look for
      <i>&ldquo;WebGL: Disabled&rdquo;</i> or <i>&ldquo;Problems Detected&rdquo;</i>.</li>
      <li>Safari: <b>Safari &rarr; Settings &rarr; Advanced &rarr; Enable WebGL</b> must be ticked.</li>
    </ol>
  </div>`

function createRenderer(): THREE.WebGLRenderer {
  const attempts: THREE.WebGLRendererParameters[] = [
    { antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
    { antialias: false, preserveDrawingBuffer: true, powerPreference: 'default' },
    { antialias: false, preserveDrawingBuffer: false, powerPreference: 'default' },
  ]
  for (const params of attempts) {
    try {
      const r = new THREE.WebGLRenderer(params)
      if (r.getContext()) return r
    } catch {
      /* try the next, lighter configuration */
    }
  }
  document.body.innerHTML = FATAL
  throw new Error('WebGL unavailable')
}

const renderer = createRenderer()

// Retina displays quadruple the pixel count; combined with additive particles that
// is enough overdraw to crash a GPU process, so cap it.
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
renderer.setSize(window.innerWidth, window.innerHeight)
// Shadows are off: the three shadow casters cost about a quarter of the frame on a mid-range phone, and the room is static.
renderer.shadowMap.enabled = false
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.2
renderer.xr.enabled = true
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x101014)

const pmrem = new THREE.PMREMGenerator(renderer)
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
scene.environmentIntensity = 0.6

// A longer lens on wide screens keeps the room from feeling cavernous; a phone needs the width.
const lensFor = (aspect: number) => (aspect < 1 ? 75 : 60)
const camera = new THREE.PerspectiveCamera(
  lensFor(window.innerWidth / window.innerHeight),
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
)
camera.position.set(0, 1.75, 6.6)
installTextureCache(renderer, scene, camera)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.target.set(0, 1.9, 0)
controls.maxPolarAngle = Math.PI / 2 + 0.09
controls.minDistance = 0.8
controls.maxDistance = 30

const { W, H, D } = GALLERY

// Enhanced lighting setup for premium gallery feel
const hemi = new THREE.HemisphereLight(0xffeedd, 0x223344, 0.8)
scene.add(hemi)
const ambient = new THREE.AmbientLight(0xffffff, 0.25)
scene.add(ambient)

// Main gallery spotlight - warm gallery lighting
const sun = new THREE.DirectionalLight(0xfff5e6, 1.5)
sun.position.set(8, 12, 6)
scene.add(sun)

// Warm fill light from opposite side
const fill = new THREE.DirectionalLight(0xffeecc, 0.6)
fill.position.set(-6, 10, -5)
fill.castShadow = false
scene.add(fill)

// Accent lights for artwork highlighting
const accent1 = new THREE.SpotLight(0xfff0e0, 0.8, 25, Math.PI / 6, 0.3, 1)
accent1.position.set(-6, 6, -2)
accent1.target.position.set(-4.8, 1.85, -6)
scene.add(accent1)
scene.add(accent1.target)

const accent2 = new THREE.SpotLight(0xfff0e0, 0.8, 25, Math.PI / 6, 0.3, 1)
accent2.position.set(6, 6, -2)
accent2.target.position.set(4.8, 1.85, -6)
scene.add(accent2)
scene.add(accent2.target)

// Subtle rim light from behind
const rim = new THREE.DirectionalLight(0xffccaa, 0.3)
rim.position.set(0, 5, 10)
scene.add(rim)

// Premium floor material - polished dark stone
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a20,
  roughness: 0.3,
  metalness: 0.1,
  envMapIntensity: 0.5,
})
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(W, D),
  floorMat,
)
floor.rotation.x = -Math.PI / 2
floor.receiveShadow = true
floor.name = 'floor'
scene.add(floor)

// Premium wall material - textured gallery walls
const wallMat = new THREE.MeshStandardMaterial({
  color: 0x141418,
  roughness: 0.85,
  metalness: 0.05,
  envMapIntensity: 0.3,
})
function addWall(w: number, h: number, x: number, y: number, z: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat)
  m.position.set(x, y, z)
  m.rotation.y = ry
  m.receiveShadow = true
  scene.add(m)
}
addWall(W, H, 0, H / 2, -D / 2)
addWall(D, H, -W / 2, H / 2, 0, Math.PI / 2)
addWall(D, H, W / 2, H / 2, 0, -Math.PI / 2)

// Baseboard trim
const baseboardMat = new THREE.MeshStandardMaterial({
  color: 0x0d0d10,
  roughness: 0.5,
  metalness: 0.2,
})
function addBaseboard(w: number, x: number, z: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, 0.08), baseboardMat)
  m.position.set(x, 0.075, z)
  m.rotation.y = ry
  m.receiveShadow = true
  scene.add(m)
}
addBaseboard(W, 0, -D / 2 + 0.04)
addBaseboard(D, -W / 2 + 0.04, 0, Math.PI / 2)
addBaseboard(D, W / 2 - 0.04, 0, -Math.PI / 2)

const hangerMat = new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.4, metalness: 0.3 })

// Picture rail along the top of the three walls.
function addRail(w: number, x: number, z: number, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.05), hangerMat)
  m.position.set(x, H - 0.35, z)
  m.rotation.y = ry
  scene.add(m)
}
addRail(W, 0, -D / 2 + 0.03)
addRail(D, -W / 2 + 0.03, 0, Math.PI / 2)
addRail(D, W / 2 - 0.03, 0, -Math.PI / 2)

const initialTheme = loadTheme()
const artworkGroups = new Map<string, THREE.Group>()

const infoCard = createInfoCard()
infoCard.mesh.position.set(0, 1.2, 1.5)
scene.add(infoCard.mesh)

const plaque = createPlaque({
  onPrev: () => stepWork(-1),
  onNext: () => stepWork(1),
  onClose: () => closeWork(),
})

const wisps = createWisps()
scene.add(wisps.points)

const sound = createSoundscape(false)

let journey = createJourneyField(scene, [], initialTheme.accent)

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
const from = new THREE.Vector3()
const direction = new THREE.Vector3()
const laserLines: THREE.Line[] = []
const laserMats: THREE.LineBasicMaterial[] = []
const controllers: THREE.Group[] = []
const hovered = new Set<THREE.Group>()

// Robot M mood colours override whatever the theme's own accent is, so the
// gallery always speaks the same visual language as the hardware.
let moodAccent: string | null = null
let currentAccent = initialTheme.accent
let roomSign: THREE.Mesh | null = null

function pushAccent(themeAccent: string) {
  const accent = moodAccent ?? themeAccent
  currentAccent = accent
  infoCard.setAccent(accent)
  journey.setAccent(accent)
  plaque.setAccent(accent)
  if (roomSign) (roomSign.material as THREE.MeshBasicMaterial).color.set(accent).lerp(new THREE.Color(0xffffff), 0.45)
  const tint = new THREE.Color(accent)
  for (const laser of laserMats) laser.color.copy(tint)
}

const themeTargets: ThemeTargets = {
  wallMat,
  floorMat,
  hangerMat,
  hemi,
  ambient,
  key: sun,
  fill,
  lasers: laserMats,
  wisps: wisps.material,
  cardAccent: (accent) => pushAccent(accent),
}

let pendingWork: string | null = null
const REVEAL_MS = 6500
const reveal = { t: 0, active: false, start: 0 }
const glide = { active: false, from: new THREE.Vector3(), to: new THREE.Vector3() }

function startReveal() {
  reveal.t = 0
  reveal.active = true
  reveal.start = performance.now()
  journey.reveal(0)
  setArtBrightness(0.12)
  renderer.toneMappingExposure = 0.1
  const fog = scene.fog as THREE.Fog | null
  if (fog) {
    fog.near = 0.4
    fog.far = 5
  }
  glide.active = true
  glide.from.copy(camera.position)
  glide.to.set(0, 1.75, 6.6)
}

function stepReveal(now: number) {
  if (!reveal.active) return
  const raw = Math.min((now - reveal.start) / REVEAL_MS, 1)
  reveal.t = raw < 1 ? 1 - Math.pow(1 - raw, 3) : 1
  journey.reveal(reveal.t)
  setArtBrightness(0.12 + 0.88 * reveal.t)
  renderer.toneMappingExposure = 0.1 + 1.05 * reveal.t
  const fog = scene.fog as THREE.Fog | null
  if (fog) {
    fog.near = 0.4 + 13.6 * reveal.t
    fog.far = 5 + 37 * reveal.t
  }
  if (glide.active) {
    camera.position.lerpVectors(glide.from, glide.to, reveal.t)
    controls.target.set(0, 1.75, 0)
  }
  if (raw >= 1) {
    reveal.active = false
    glide.active = false
    camera.position.copy(glide.to)
    controls.target.copy(homeLook)
    controls.update()
    if (pendingWork) {
      const it = itemById.get(pendingWork)
      pendingWork = null
      if (it) showWork(it, true)
    }
  }
}

function normalOf(hit: THREE.Intersection): THREE.Vector3 {
  const n = hit.face!.normal.clone()
  n.transformDirection(hit.object.matrixWorld)
  return n
}

function wallNormal(item: GalleryItem): THREE.Vector3 {
  return item.type === 'artwork' ? wallNormalOf(item) : new THREE.Vector3(0, 0, 1)
}

function cardSpotFor(group: THREE.Group, item: GalleryItem): THREE.Vector3 {
  return group.position
    .clone()
    .addScaledVector(wallNormal(item), 0.5)
    .setY(group.position.y + 1.0)
}

function placeCard(cfg: GalleryItem, hit: THREE.Intersection) {
  const spot = hit.point.clone().addScaledVector(normalOf(hit), 0.5)
  spot.y += 1.0
  infoCard.show(cfg, spot)
  tools.setActiveItem(cfg.id)
}

function artworkGroupOf(object: THREE.Object3D): THREE.Group | null {
  let o: THREE.Object3D | null = object
  while (o && !o.userData.glowMat) o = o.parent
  return o as THREE.Group | null
}

function setHovered(group: THREE.Group | null) {
  hovered.clear()
  if (group) hovered.add(group)
  renderer.domElement.style.cursor = group ? 'pointer' : 'default'
}

renderer.domElement.addEventListener('pointermove', (e) => {
  // A drag that wanders off and comes back to where it started is still a drag, not a tap.
  if (tapStart && e.pointerId === tapStart.id && Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y) > tapStart.slop) {
    tapStart = null
  }
  if ((renderer.xr as unknown as { isPresenting: boolean }).isPresenting) return
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster
    .intersectObjects([...artworkGroups.values()], true)
    .find((h) => h.object.userData.artwork)
  setHovered(hit ? artworkGroupOf(hit.object) : null)
})

// A tap or click selects; a drag looks around. Selecting on pointerdown meant every drag that
// started on a piece opened its card and every drag that started on bare wall closed it, and
// the second finger of a pinch closed it too.
// A fingertip wobbles more than a mouse, so a touch tap gets a wider allowance. No time limit:
// it would ignore slow, careful taps, which matters more here than catching very slow drags.
const TAP_SLOP_MOUSE_PX = 8
const TAP_SLOP_TOUCH_PX = 12
let tapStart: { x: number; y: number; id: number; slop: number } | null = null

renderer.domElement.addEventListener('pointerdown', (e) => {
  if ((renderer.xr as unknown as { isPresenting: boolean }).isPresenting) return
  // Grabbing the view takes over from a glide to a piece; the tour keeps its own pacing.
  if (focus.active && !tour.active) {
    focus.active = false
    if (autoRotateSetting) controls.autoRotate = true
  }
  const slop = e.pointerType === 'touch' ? TAP_SLOP_TOUCH_PX : TAP_SLOP_MOUSE_PX
  tapStart = e.isPrimary && e.button === 0 ? { x: e.clientX, y: e.clientY, id: e.pointerId, slop } : null
})

renderer.domElement.addEventListener('pointercancel', () => {
  tapStart = null
})

renderer.domElement.addEventListener('pointerup', (e) => {
  if ((renderer.xr as unknown as { isPresenting: boolean }).isPresenting) return
  const start = tapStart
  tapStart = null
  if (!start || e.pointerId !== start.id) return
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > start.slop) return
  pointer.x = (e.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1
  raycaster.setFromCamera(pointer, camera)
  const hit = raycaster
    .intersectObjects(scene.children, true)
    .find((h) => h.object.userData.artwork)
  if (!hit) {
    infoCard.hide()
    plaque.hide()
    return
  }
  const item = hit.object.userData.config as GalleryItem
  if (item.type !== 'artwork') {
    placeCard(item, hit)
    return
  }
  // Same move as picking the work from LIST: fly in so it fills the view. During a tour the
  // tour owns the camera, so only the label changes.
  showWork(item, !tour.active)
})

function initControllers() {
  for (const handedness of [0, 1]) {
    const controller = renderer.xr.getController(handedness)
    controller.addEventListener('select', () => {
      controller.getWorldPosition(from)
      // The laser is drawn along the controller's -Z. getWorldDirection returns the controller's +Z,
      // so without negate() the trigger picked what was behind the visitor.
      controller.getWorldDirection(direction).negate()
      raycaster.set(from, direction)
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((h) => h.object.userData.artwork)
      if (hit) {
        placeCard(hit.object.userData.config as GalleryItem, hit)
      } else {
        infoCard.hide()
      }
    })
    const laserMat = new THREE.LineBasicMaterial({
      color: 0x6ea8fe,
      transparent: true,
      opacity: 0.35,
    })
    const laser = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.02), new THREE.Vector3(0, 0, -3)]),
      laserMat,
    )
    laserLines.push(laser)
    laserMats.push(laserMat)
    controller.add(laser)
    scene.add(controller)
    controllers.push(controller)
  }
}
initControllers()

const timer = new THREE.Timer()
timer.connect(document)
const cameraGoal = new THREE.Vector3()
const lookGoal = new THREE.Vector3()
const focus = { active: false, pos: new THREE.Vector3(), look: new THREE.Vector3() }
const tour = { active: false, index: 0, waiting: false, timer: 0 }
const homePos = new THREE.Vector3(0, 1.75, 6.6)
const homeLook = new THREE.Vector3(0, 1.9, 0)
let homeCaptured = false
let autoRotateSetting = false
const settings = createSettingsUI({
  scene,
  targets: themeTargets,
  initialTheme,
  onAutoRotate: (on) => {
    autoRotateSetting = on
    if (!tour.active && !focus.active) controls.autoRotate = on
    controls.autoRotateSpeed = 0.5
  },
  onLasers: (on) => {
    for (const line of laserLines) line.visible = on
  },
  onSound: (on) => {
    sound.setMuted(!on)
  },
})

const title = document.createElement('div')
title.id = 'title'
title.className = 'ui'
title.textContent = EXHIBITION.toUpperCase()
document.body.appendChild(title)

const moodLine = document.createElement('div')
moodLine.id = 'mood-line'
moodLine.className = 'ui'
document.body.appendChild(moodLine)

const hint = document.createElement('div')
hint.id = 'hint'
hint.className = 'ui'
hint.textContent = window.matchMedia('(pointer: coarse)').matches
  ? 'Drag to look · pinch to zoom · tap a work'
  : 'Drag to look · scroll to zoom · click a work · ← → to walk'
document.body.appendChild(hint)

const footer = document.createElement('div')
footer.id = 'footer'
footer.className = 'ui'
footer.textContent = 'An EchoBloom Initiative by IPMD — art that heals, inspires & dignifies.'
document.body.appendChild(footer)

const moodModal = createMoodModal({
  fallbackFocus: () => tools?.feelBtn ?? null,
  onApply(mood) {
    moodAccent = mood.accent
    settings.setThemeId(mood.themeId)
    pushAccent(settings.currentTheme().accent)
    localStorage.setItem(MOOD_KEY, mood.id)
    moodLine.textContent = `“${mood.line}”`
    moodLine.style.color = mood.accent
    moodLine.classList.add('showing')
    moodModal.close()
  },
})

const landing = document.createElement('div')
landing.id = 'landing'
landing.className = 'ui'
const landingKicker = document.createElement('div')
landingKicker.className = 'landing-kicker'
landingKicker.textContent = 'THE ECHOBLOOM EXHIBITION HALL'
const landingTitle = document.createElement('div')
landingTitle.className = 'landing-title'
landingTitle.textContent = EXHIBITION.toUpperCase()
const landingLine = document.createElement('div')
landingLine.className = 'landing-line'
landingLine.textContent = 'Take a breath. Let the art meet how you feel.'
const landingSub = document.createElement('div')
landingSub.className = 'landing-sub'
landingSub.textContent =
  `${WORK_COUNT} works by student artists, in ${ROOMS.length} rooms — a healing space that senses the mood and meets you there.`
const landingEnter = document.createElement('button')
landingEnter.id = 'landing-enter'
landingEnter.textContent = 'ENTER THE GALLERY'
const landingNote = document.createElement('div')
landingNote.className = 'landing-note'
landingNote.textContent = 'A gentle soundscape begins when you enter'
landing.append(landingKicker, landingTitle, landingLine, landingSub, landingEnter, landingNote)
document.body.appendChild(landing)

let entered = false
let enteredAt = 0

function enterGallery() {
  if (entered) return
  entered = true
  enteredAt = performance.now()
  sound.start()
  localStorage.setItem(VISITED_KEY, '1')
  landing.classList.add('leaving')
  setTimeout(() => landing.remove(), 800)
  setTimeout(() => moodModal.open(), 400)
  setTimeout(() => startReveal(), 900)
}

landingEnter.addEventListener('click', () => {
  clearTimeout(autoAdvanceTimer)
  enterGallery()
})

// Journey-style opening: hands off after a beat if the visitor just watches
const autoAdvanceTimer = setTimeout(() => {
  if (document.body.contains(landing)) enterGallery()
}, 12000)

if (localStorage.getItem(VISITED_KEY)) {
  landing.remove()
  const saved = moodById(localStorage.getItem(MOOD_KEY))
  if (saved) {
    moodAccent = saved.accent
    pushAccent(settings.currentTheme().accent)
    moodLine.textContent = `“${saved.line}”`
    moodLine.style.color = saved.accent
    moodLine.classList.add('showing')
  }
  setTimeout(() => startReveal(), 500)
} else {
  window.addEventListener(
    'pointerdown',
    () => sound.start(),
    { once: true },
  )
  // Keyboard users start on the one control that matters here, not on the gear behind the landing.
  landingEnter.focus({ preventScroll: true })
}

document.title = `${EXHIBITION} — EchoBloom Exhibition Hall`

function createVRButton(): HTMLButtonElement | null {
  if (!('xr' in navigator)) return null
  const button = document.createElement('button')
  button.className = 'vr ui'
  button.textContent = 'ENTER VR'
  let session: XRSession | null = null
  button.addEventListener('click', async () => {
    if (session) {
      await session.end()
      return
    }
    try {
      session = await navigator.xr!.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor'],
      })
      await renderer.xr.setSession(session)
      button.textContent = 'EXIT VR'
    } catch {
      button.textContent = 'VR UNAVAILABLE'
    }
  })
  // XRSystem never fires 'end'; the session does. three reports it as 'sessionend' for both the
  // EXIT VR button and the headset's own menu, so the button resets and VR can be entered again.
  renderer.xr.addEventListener('sessionend', () => {
    session = null
    button.textContent = 'ENTER VR'
  })
  return button
}

const vrButton = createVRButton()
if (vrButton) document.body.appendChild(vrButton)

// Left and Right step through the main controls in screen order, wrapping at the ends.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  // Skip controls that are hidden (photo mode hides every .ui element); they cannot take focus.
  const shown = (el: HTMLElement) =>
    getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0
  const bar = [
    document.getElementById('settings-gear'),
    tools.photoBtn,
    tools.tourBtn,
    tools.listBtn,
    tools.feelBtn,
    vrButton,
  ].filter((el): el is HTMLElement => el !== null && shown(el))
  const at = bar.indexOf(document.activeElement as HTMLElement)
  if (at === -1) return
  e.preventDefault()
  const step = e.key === 'ArrowRight' ? 1 : -1
  bar[(at + step + bar.length) % bar.length].focus({ preventScroll: true })
})

let tools: ToolUI

const isPresenting = () => (renderer.xr as unknown as { isPresenting: boolean }).isPresenting

/** Where the camera stands to look at a work: square on, at the work's height, far enough back to frame it and leave room for its label. */
function viewFor(group: THREE.Group, item: GalleryItem): { pos: THREE.Vector3; look: THREE.Vector3 } {
  const n = wallNormal(item)
  const w = item.type === 'artwork' ? (item.width ?? 1.2) : 1.2
  const h = item.type === 'artwork' ? (item.height ?? 1.5) : 1.5
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
  const narrow = window.innerWidth <= 640
  // Frame the work in the screen band left free by the UI: under the room bar, and on a phone
  // above the label sheet. `fillH` is the band's share of the height, `shift` how far its
  // centre sits below (+) or above (-) the screen centre, as a share of half the height.
  const vh = window.innerHeight
  const top = narrow ? 168 : 140
  const bottom = narrow ? Math.min(vh * 0.46, 330) + 16 : 96
  const band = Math.max(vh - top - bottom, vh * 0.35)
  const fillH = (band / vh) * 0.92
  const shift = (top + band / 2 - vh / 2) / (vh / 2)
  const fillW = narrow ? 0.88 : 0.56
  // Fit the frame as well as the image.
  const fh = h + 0.3
  const fw = w + 0.3
  const distance = Math.max(fh / 2 / (t * fillH), fw / 2 / (t * camera.aspect * fillW), 1.4)
  // Moving the look point up puts the work lower on screen, and the reverse.
  const lookY = group.position.y + shift * t * distance
  const look = group.position.clone().setY(lookY)
  const pos = group.position.clone().addScaledVector(n, distance).setY(lookY)
  return { pos, look }
}

function startFocus(group: THREE.Group, item: GalleryItem) {
  const v = viewFor(group, item)
  cameraGoal.copy(v.pos)
  lookGoal.copy(v.look)
  focus.pos.copy(cameraGoal)
  focus.look.copy(lookGoal)
  focus.active = true
  controls.autoRotate = false
}

// ---------------------------------------------------------------------------------------------
// Rooms. One room is in the scene at a time; stepping to another fades through black, frees the
// old room's textures and builds the new one.

let currentRoom = -1
let roomContent: THREE.Group | null = null
let transitioning = false
let activeWorkId: string | null = null

const fadeEl = document.createElement('div')
fadeEl.id = 'room-fade'
document.body.appendChild(fadeEl)

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function buildRoom(index: number): Promise<void> {
  const layout = roomLayouts[index]
  const groups = await Promise.all(layout.map((cfg) => createArtwork(cfg)))
  const content = new THREE.Group()
  content.name = `room-${ROOMS[index].number}`
  const frameColor = settings.currentTheme().frame
  groups.forEach((group, i) => {
    group.traverse((o) => {
      if (o.userData.frame) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(frameColor)
      if (o.userData.glow) ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.set(currentAccent)
    })
    content.add(createWash(layout[i]), group)
  })
  const sign = createRoomSign(ROOMS[index])
  content.add(sign)

  // Swap: drop the old room, then put the new one in.
  if (roomContent) {
    scene.remove(roomContent)
    disposeObject(roomContent)
  }
  artworkGroups.clear()
  groups.forEach((g, i) => artworkGroups.set(layout[i].id, g))
  hovered.clear()
  roomContent = content
  roomSign = sign
  scene.add(content)

  journey.dispose()
  journey = createJourneyField(scene, layout, currentAccent)
  journey.reveal(reveal.active ? reveal.t : 1)
  pushAccent(settings.currentTheme().accent)

  currentRoom = index
  updateRoomBar()
  prefetchRoom(ROOMS[index + 1])
  prefetchRoom(ROOMS[index - 1])
}

/** Move to another room. With `workId`, arrive already looking at that work. */
async function goToRoom(index: number, workId?: string): Promise<void> {
  if (index < 0 || index >= ROOMS.length || transitioning) return
  if (index === currentRoom) {
    if (workId) showWork(itemById.get(workId)!, true)
    return
  }
  transitioning = true
  infoCard.hide()
  plaque.hide()
  fadeEl.classList.add('on')
  await wait(380)
  await buildRoom(index)
  focus.active = false
  const item = workId ? itemById.get(workId) : undefined
  const group = item ? artworkGroups.get(item.id) : undefined
  if (item && group) {
    const v = viewFor(group, item)
    camera.position.copy(v.pos)
    controls.target.copy(v.look)
    showWork(item, false)
  } else {
    camera.position.copy(homePos)
    controls.target.copy(homeLook)
    activeWorkId = null
    tools.setActiveItem(null)
    setHash(`room-${ROOMS[index].number}`)
  }
  controls.update()
  fadeEl.classList.remove('on')
  transitioning = false
}

/** Show a work's label and, with `fly`, glide the camera to it. Crosses rooms if it has to. */
function showWork(item: ArtworkConfig, fly = true) {
  const room = ROOMS.findIndex((r) => r.number === item.room)
  if (room !== currentRoom) {
    void goToRoom(room, item.id)
    return
  }
  const group = artworkGroups.get(item.id)
  if (!group) return
  if (fly) startFocus(group, item)
  if (isPresenting()) {
    infoCard.show(item, cardSpotFor(group, item))
  } else {
    plaque.show(item, { index: indexById.get(item.id) ?? 0, total: items.length })
  }
  activeWorkId = item.id
  tools.setActiveItem(item.id)
  setHash(`work-${item.no}`)
}

function stepWork(step: number) {
  if (tour.active) endTour()
  const at = activeWorkId ? (indexById.get(activeWorkId) ?? -1) : -1
  const next = items[(at + step + items.length) % items.length]
  showWork(next, true)
}

function closeWork() {
  plaque.hide()
  infoCard.hide()
  activeWorkId = null
  tools.setActiveItem(null)
  setHash(`room-${ROOMS[currentRoom].number}`)
}

function setHash(h: string) {
  history.replaceState(null, '', `#${h}`)
}

/** `#work-18` or `#room-3`, so a link can open the hall at one work or room. */
function readHash(): { room: number; workId?: string } {
  const h = location.hash.slice(1)
  const work = /^work-(\d+)$/.exec(h)
  if (work) {
    const it = items.find((i) => i.no === Number(work[1]))
    if (it) return { room: ROOMS.findIndex((r) => r.number === it.room), workId: it.id }
  }
  const room = /^room-(\d+)$/.exec(h)
  if (room) {
    const idx = ROOMS.findIndex((r) => r.number === Number(room[1]))
    if (idx !== -1) return { room: idx }
  }
  return { room: 0 }
}

// Room bar: the hall's wayfinding, top centre.
const roomBar = document.createElement('nav')
roomBar.id = 'room-bar'
roomBar.className = 'ui'
roomBar.setAttribute('aria-label', 'Rooms')
const roomPrev = document.createElement('button')
roomPrev.className = 'room-step'
roomPrev.setAttribute('aria-label', 'Previous room')
roomPrev.textContent = '‹'
const roomNext = document.createElement('button')
roomNext.className = 'room-step'
roomNext.setAttribute('aria-label', 'Next room')
roomNext.textContent = '›'
const roomInfo = document.createElement('div')
roomInfo.className = 'room-info'
const roomNum = document.createElement('div')
roomNum.className = 'room-num'
const roomName = document.createElement('div')
roomName.className = 'room-name'
const roomDots = document.createElement('div')
roomDots.className = 'room-dots'
const dotButtons = ROOMS.map((r, i) => {
  const d = document.createElement('button')
  d.className = 'room-dot'
  d.setAttribute('aria-label', roomLabel(r))
  d.title = `${roomLabel(r)} — ${r.works.length} work${r.works.length === 1 ? '' : 's'}`
  d.addEventListener('click', () => {
    if (tour.active) endTour()
    void goToRoom(i)
  })
  roomDots.appendChild(d)
  return d
})
roomInfo.append(roomNum, roomName, roomDots)
roomBar.append(roomPrev, roomInfo, roomNext)
document.body.appendChild(roomBar)
roomPrev.addEventListener('click', () => {
  if (tour.active) endTour()
  void goToRoom(currentRoom - 1)
})
roomNext.addEventListener('click', () => {
  if (tour.active) endTour()
  void goToRoom(currentRoom + 1)
})

function updateRoomBar() {
  const r = ROOMS[currentRoom]
  roomNum.textContent = `Room ${r.number} of ${ROOMS.length}  ·  ${r.works.length} work${r.works.length === 1 ? '' : 's'}`
  roomName.textContent = r.name ?? `Room ${r.number}`
  roomPrev.disabled = currentRoom === 0
  roomNext.disabled = currentRoom === ROOMS.length - 1
  dotButtons.forEach((d, i) => d.classList.toggle('current', i === currentRoom))
}

// The tour walks the whole hall, starting in the room you are standing in.
function startTour() {
  tour.active = true
  tour.waiting = false
  tour.timer = 0
  tools.setTourActive(true)
  controls.autoRotate = false
  const first = items.findIndex((it) => it.room === ROOMS[currentRoom].number)
  tour.index = first === -1 ? 0 : first
  tourStep()
}

function tourStep() {
  if (tour.index >= items.length) {
    endTour()
    return
  }
  const item = items[tour.index]
  tour.index++
  showWork(item, true)
}

function endTour() {
  tour.active = false
  tour.waiting = false
  tools.setTourActive(false)
  closeWork()
  cameraGoal.copy(homePos)
  lookGoal.copy(homeLook)
  focus.pos.copy(homePos)
  focus.look.copy(homeLook)
  focus.active = true
  controls.autoRotate = false
}

// The live view caps the pixel ratio at 1.75 to protect phone GPUs. On a 3x phone that made the
// saved photo only 58% of the screen's width, so the photo frame alone renders at the full ratio.
const PHOTO_MAX_RATIO = 3
const PHOTO_MAX_SIDE_PX = 4096

function takePhoto() {
  const liveRatio = renderer.getPixelRatio()
  const longSide = Math.max(window.innerWidth, window.innerHeight)
  const photoRatio = Math.max(liveRatio, Math.min(window.devicePixelRatio, PHOTO_MAX_RATIO, PHOTO_MAX_SIDE_PX / longSide))
  document.body.classList.add('photo-mode')
  let url: string
  // If the capture throws, the live view still goes back to its own ratio and shows its controls.
  try {
    if (photoRatio !== liveRatio) renderer.setPixelRatio(photoRatio)
    renderer.render(scene, camera)
    url = renderer.domElement.toDataURL('image/png')
  } finally {
    if (photoRatio !== liveRatio) renderer.setPixelRatio(liveRatio)
    document.body.classList.remove('photo-mode')
  }
  const a = document.createElement('a')
  a.href = url
  a.download = `first-light-${Date.now()}.png`
  a.click()
}

tools = createTools({
  onPhoto: takePhoto,
  onTour: startTour,
  onStopTour: endTour,
  onFeel: () => {
    sound.start()
    moodModal.open()
  },
})
tools.renderList(items, null, (item) => {
  if (tour.active) endTour()
  if (item.type === 'artwork') showWork(item, true)
})

// Arrow keys with nothing focused: step between works when a label is open, between rooms otherwise.
window.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (document.activeElement && document.activeElement !== document.body) return
  e.preventDefault()
  const step = e.key === 'ArrowRight' ? 1 : -1
  if (activeWorkId) stepWork(step)
  else void goToRoom(currentRoom + step)
})

const startAt = readHash()
// A linked work is shown once the opening reveal has settled; see stepReveal.
pendingWork = startAt.workId ?? null
void buildRoom(startAt.room)

;(window as unknown as Record<string, unknown>).__es = {
  glowOpacities: () => [...artworkGroups.values()].map((g) => (g.userData.glowMat as THREE.MeshBasicMaterial).opacity),
  artTextureProbe: (id: string) => {
    const group = artworkGroups.get(id)
    if (!group) return null
    let tex: THREE.CanvasTexture | null = null
    group.traverse((o) => {
      if (!tex && (o as THREE.Mesh).isMesh) {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial
        if (mat.map) tex = mat.map as THREE.CanvasTexture
      }
    })
    if (!tex) return null
    const cv = (tex as THREE.CanvasTexture).image as HTMLCanvasElement
    const c = document.createElement('canvas')
    c.width = cv.width; c.height = cv.height
    const cx = c.getContext('2d')!
    cx.drawImage(cv, 0, 0)
    const d = cx.getImageData(0, 0, c.width, c.height).data
    const rgb = (x: number, y: number) => { const i = (y * c.width + x) * 4; return [d[i], d[i + 1], d[i + 2]] }
    return { size: [cv.width, cv.height], top: rgb(256, 100), bottom: rgb(256, 500), center: rgb(256, 335) }
  },
  tourActive: () => tour.active,
  artScreenPos: (id: string) => {
    const group = artworkGroups.get(id)
    if (!group) return null
    const v = new THREE.Vector3()
    group.children.forEach((child) => {
      if (child.userData.frame) child.getWorldPosition(v)
    })
    v.project(camera)
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight }
  },
  groupCount: () => artworkGroups.size,
  landingPresent: () => !!document.getElementById('landing'),
  moodOpen: () => moodModal.isOpen(),
  moodLine: () => moodLine.textContent,
  wisps: () => ({
    count: wisps.points.geometry.attributes.position.count,
    color: '#' + wisps.material.color.getHexString(),
    opacity: wisps.material.opacity,
  }),
  themeId: () => settings.currentTheme().id,
  soundStarted: () => sound.started(),
  cardProbe: () => {
    const mat = infoCard.mesh.material as THREE.MeshBasicMaterial
    const tex = mat.map as THREE.CanvasTexture | null
    const diag = {
      hasMap: !!mat.map,
      opacity: mat.opacity,
      uuid: infoCard.mesh.uuid,
      inScene: !!scene.getObjectById(infoCard.mesh.id),
      size: tex?.image ? (tex.image as HTMLCanvasElement).width : 0,
    }
    if (!tex) return diag
    const cv = tex.image as HTMLCanvasElement
    const c = document.createElement('canvas')
    c.width = cv.width
    c.height = cv.height
    const cx = c.getContext('2d')!
    cx.drawImage(cv, 0, 0)
    const d = cx.getImageData(96, 640, cv.width - 192, 200).data
    let bright = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] > 380) bright++
    }
    return { ...diag, strip: [96, 640, cv.width - 192, 200], brightPixels: bright }
  },
  probe: () => {
    const out: unknown[] = []
    scene.traverse((o) => {
      if (o.userData.frame || o.userData.artwork || o.userData.glow) {
        const p = o.position
        out.push({ n: o.name || o.type, f: !!o.userData.frame, a: !!o.userData.artwork, g: !!o.userData.glow, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) })
      }
    })
    return out
  },
  pick: (x: number, y: number) => {
    pointer.x = (x / window.innerWidth) * 2 - 1
    pointer.y = -(y / window.innerHeight) * 2 + 1
    raycaster.setFromCamera(pointer, camera)
    const hits = raycaster
      .intersectObjects([...artworkGroups.values()], true)
      .filter((h) => h.object.userData.artwork)
      .slice(0, 3)
      .map((h) => ({ name: h.object.name, group: h.object.parent?.name ?? 'none', artwork: !!h.object.userData.artwork }))
    const any = raycaster
      .intersectObjects(scene.children, true)
      .slice(0, 3)
      .map((h) => ({ name: h.object.name || h.object.type, art: !!h.object.userData.artwork, z: h.point.z.toFixed(2) }))
    return { hits, any, cam: camera.position.toArray(), target: controls.target.toArray() }
  },
  journey: () => ({
    dust: {
      count: journey.dust.geometry.attributes.position.count,
      size: (journey.dust.material as THREE.PointsMaterial).size,
      opacity: (journey.dust.material as THREE.PointsMaterial).opacity,
    },
    ribbons: journey.ribbons.length,
    beacons: journey.beacons.length,
    accent: moodAccent ?? settings.currentTheme().accent,
    revealT: +reveal.t.toFixed(2),
    revealActive: reveal.active,
    exposure: +renderer.toneMappingExposure.toFixed(2),
  }),
}

renderer.xr.addEventListener('sessionstart', () => {
  controls.enabled = false
  tools.setPhotoDisabled(true)
})
renderer.xr.addEventListener('sessionend', () => {
  controls.enabled = true
  tools.setPhotoDisabled(false)
})

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.fov = lensFor(camera.aspect)
  camera.updateProjectionMatrix()
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
  renderer.setSize(window.innerWidth, window.innerHeight)
})

window.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return
  if (tour.active) endTour()
  else if (activeWorkId) closeWork()
})

// Dev-only performance readout: open the dev server with ?perf. The import.meta.env.DEV
// check is replaced by `false` in production builds, so the module is never bundled.
let perf: import('./gallery/perf.ts').PerfOverlay | null = null
if (import.meta.env.DEV && new URLSearchParams(location.search).has('perf')) {
  void import('./gallery/perf.ts').then((m) => {
    perf = m.createPerfOverlay(renderer, scene, camera)
  })
}

const viewPos = new THREE.Vector3()
let elapsed = 0
renderer.setAnimationLoop(() => {
  perf?.begin()
  timer.update()
  const delta = Math.min(timer.getDelta(), 0.1)
  elapsed += delta

  stepReveal(performance.now())
  if (glide.active) {
    renderer.render(scene, camera)
    perf?.end()
    return
  }

  wisps.update(delta)
  journey.update(delta, elapsed)

  const dwell = entered ? (performance.now() - enteredAt) / 1000 : 0
  const soundPhase =
    dwell < 6 ? 'silence'
    : dwell < 26 ? 'ambient_whisper'
    : dwell < 60 ? 'ambient_breath'
    : 'ambient_melody'
  sound.setPhase(soundPhase)

  if (!homeCaptured) {
    homePos.copy(camera.position)
    homeLook.copy(controls.target)
    homeCaptured = true
  }

  if ((renderer.xr as unknown as { isPresenting: boolean }).isPresenting) {
    hovered.clear()
    for (const controller of controllers) {
      controller.getWorldPosition(from)
      controller.getWorldDirection(direction).negate() // along the laser, as in the select handler
      raycaster.set(from, direction)
      const hit = raycaster
        .intersectObjects([...artworkGroups.values()], true)
        .find((h) => h.object.userData.artwork)
      if (hit) {
        const group = artworkGroupOf(hit.object)
        if (group) hovered.add(group)
      }
    }
  }

  updateGlows(artworkGroups.values(), hovered)

  if (focus.active) {
    camera.position.lerp(focus.pos, 0.06)
    controls.target.lerp(focus.look, 0.06)
    // controls.update() is skipped during a glide, so turn here or the view snaps when it ends.
    if (!(renderer.xr as unknown as { isPresenting: boolean }).isPresenting) camera.lookAt(controls.target)
    if (camera.position.distanceTo(focus.pos) < 0.1) {
      focus.active = false
      if (!tour.active && autoRotateSetting) controls.autoRotate = true
    }
  }
  if (tour.active && !focus.active && !transitioning) {
    tour.waiting = true
    tour.timer += delta
    if (tour.timer > 3.2) {
      tour.waiting = false
      tour.timer = 0
      tourStep()
    }
  }

  if (controls.enabled && !focus.active) controls.update()
  if ((renderer.xr as unknown as { isPresenting: boolean }).isPresenting) {
    renderer.xr.getCamera().getWorldPosition(viewPos)
  } else {
    camera.getWorldPosition(viewPos)
  }
  infoCard.lookAt(viewPos)
  renderer.render(scene, camera)
  perf?.end()
})
