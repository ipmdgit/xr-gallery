export interface Mood {
  id: string
  label: string
  /** Robot M mood vocabulary — must stay in sync with the hardware. */
  robotM: 'warm' | 'sad' | 'calm' | 'dynamic'
  themeId: string
  /** Accent the gallery adopts when this mood is active. */
  accent: string
  line: string
}

export const MOODS: Mood[] = [
  {
    id: 'warm',
    label: 'Warm',
    robotM: 'warm',
    themeId: 'midnight',
    accent: '#f5b942',
    line: 'Gold settles in, the way a hand does on a shoulder.',
  },
  {
    id: 'sad',
    label: 'Sad',
    robotM: 'sad',
    themeId: 'arctic',
    accent: '#5aa9e6',
    line: 'Blue is allowed to be here. It never asks you to explain.',
  },
  {
    id: 'calm',
    label: 'Calm',
    robotM: 'calm',
    themeId: 'berry',
    accent: '#9b7bd4',
    line: 'Purple keeps the room quiet enough to hear yourself think.',
  },
  {
    id: 'dynamic',
    label: 'Dynamic',
    robotM: 'dynamic',
    themeId: 'ember',
    accent: '#ff5a3c',
    line: 'Red wakes things up — for once, on purpose.',
  },
]

export function moodById(id: string | null): Mood | undefined {
  return MOODS.find((m) => m.id === id)
}

export interface MoodModal {
  open: () => void
  close: () => void
  isOpen: () => boolean
}

export function createMoodModal(opts: {
  onApply: (mood: Mood) => void
  /** Where focus goes on close when the control that opened the dialog is gone. */
  fallbackFocus?: () => HTMLElement | null
}): MoodModal {
  const overlay = document.createElement('div')
  overlay.id = 'mood-overlay'
  overlay.className = 'ui hidden'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', 'mood-title')
  overlay.setAttribute('aria-describedby', 'mood-sub')

  const card = document.createElement('div')
  card.id = 'mood-card'

  const title = document.createElement('div')
  title.id = 'mood-title'
  title.className = 'mood-title'
  title.textContent = 'How are you feeling?'

  const sub = document.createElement('div')
  sub.id = 'mood-sub'
  sub.className = 'mood-sub'
  sub.textContent =
    'EchoBloom senses the mood — pick the one that fits, and the gallery will meet you there.'

  const grid = document.createElement('div')
  grid.className = 'mood-grid'

  for (const mood of MOODS) {
    const btn = document.createElement('button')
    btn.className = 'mood-btn'
    btn.dataset.mood = mood.id
    const dot = document.createElement('span')
    dot.className = 'mood-dot'
    dot.setAttribute('aria-hidden', 'true')
    dot.style.background = `radial-gradient(circle at 34% 30%, #ffffffcc 0%, ${mood.accent} 46%, ${mood.accent}22 100%)`
    dot.style.boxShadow = `0 0 22px ${mood.accent}66`
    const label = document.createElement('span')
    label.textContent = mood.label
    btn.append(dot, label)
    btn.addEventListener('click', () => opts.onApply(mood))
    grid.appendChild(btn)
  }

  const note = document.createElement('div')
  note.className = 'mood-note'
  note.textContent = 'M senses the mood. It never detects emotions.'

  card.append(title, sub, grid, note)
  overlay.appendChild(card)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hide()
  })

  let opener: HTMLElement | null = null
  let hideTimer = 0

  function focusables(): HTMLElement[] {
    return Array.from(overlay.querySelectorAll<HTMLElement>('button:not([disabled])'))
  }

  // Keep Tab inside the dialog while it is open, including when focus has strayed outside it.
  function onKeydown(e: KeyboardEvent) {
    // Escape belongs to the dialog, so it closes however the dialog is reused.
    if (e.key === 'Escape') {
      hide()
      return
    }
    const items = focusables()
    if (items.length === 0) return
    const active = document.activeElement
    // Left and Right step through the four moods, wrapping at the ends.
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const at = items.indexOf(active as HTMLElement)
      if (at === -1) return
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      items[(at + step + items.length) % items.length].focus({ preventScroll: true })
      return
    }
    if (e.key !== 'Tab') return
    const first = items[0]
    const last = items[items.length - 1]
    if (!overlay.contains(active)) {
      e.preventDefault()
      first.focus()
    } else if (e.shiftKey && active === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  function isActive() {
    return !overlay.classList.contains('hidden') && !overlay.classList.contains('fading')
  }

  function hide() {
    if (!isActive()) return
    document.removeEventListener('keydown', onKeydown, true)
    overlay.classList.add('fading')
    // The fade lasts 420 ms; keep its buttons out of the tab order meanwhile.
    overlay.inert = true
    const target = opener && opener.isConnected ? opener : (opts.fallbackFocus?.() ?? null)
    opener = null
    target?.focus({ preventScroll: true })
    hideTimer = window.setTimeout(() => {
      overlay.classList.remove('fading', 'showing')
      overlay.classList.add('hidden')
      overlay.inert = false
    }, 420)
  }

  document.body.appendChild(overlay)

  return {
    open() {
      if (isActive()) return
      clearTimeout(hideTimer)
      overlay.inert = false
      overlay.classList.remove('hidden', 'fading')
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      document.addEventListener('keydown', onKeydown, true)
      requestAnimationFrame(() => overlay.classList.add('showing'))
      focusables()[0]?.focus({ preventScroll: true })
    },
    close: hide,
    isOpen: isActive,
  }
}
