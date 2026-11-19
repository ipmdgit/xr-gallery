import type { ArtworkConfig } from './artwork.ts'

/**
 * The wall label for the selected work, as HTML rather than a texture in the room: it stays
 * sharp at any size, it is readable on a 360 px phone, and screen readers can reach it.
 * VR still uses the 3D info card, since there is no DOM in a headset.
 */
export interface Plaque {
  show: (config: ArtworkConfig, position: { index: number; total: number }) => void
  hide: () => void
  isOpen: () => boolean
  setAccent: (hex: string) => void
}

export function createPlaque(opts: {
  onPrev: () => void
  onNext: () => void
  onClose: () => void
}): Plaque {
  const el = document.createElement('section')
  el.id = 'plaque'
  el.className = 'ui'
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-label', 'Artwork label')

  const kicker = document.createElement('div')
  kicker.className = 'plaque-kicker'
  const title = document.createElement('h2')
  title.className = 'plaque-title'
  const titleKo = document.createElement('div')
  titleKo.className = 'plaque-title-ko'
  titleKo.lang = 'ko'
  const rule = document.createElement('div')
  rule.className = 'plaque-rule'
  const credits = document.createElement('dl')
  credits.className = 'plaque-credits'

  const nav = document.createElement('div')
  nav.className = 'plaque-nav'
  const prev = document.createElement('button')
  prev.className = 'plaque-btn'
  prev.setAttribute('aria-label', 'Previous work')
  prev.textContent = '‹'
  const count = document.createElement('span')
  count.className = 'plaque-count'
  const next = document.createElement('button')
  next.className = 'plaque-btn'
  next.setAttribute('aria-label', 'Next work')
  next.textContent = '›'
  const close = document.createElement('button')
  close.className = 'plaque-close'
  close.setAttribute('aria-label', 'Close label')
  close.textContent = '×'
  nav.append(prev, count, next)

  el.append(close, kicker, title, titleKo, rule, credits, nav)
  document.body.appendChild(el)

  prev.addEventListener('click', opts.onPrev)
  next.addEventListener('click', opts.onNext)
  close.addEventListener('click', opts.onClose)

  let open = false

  function row(label: string, value: string) {
    const dt = document.createElement('dt')
    dt.textContent = label
    const dd = document.createElement('dd')
    dd.textContent = value
    credits.append(dt, dd)
  }

  return {
    show(config, pos) {
      kicker.textContent = [config.no != null ? `No. ${config.no}` : null, config.roomLabel]
        .filter(Boolean)
        .join('  ·  ')
      title.textContent = config.title
      titleKo.textContent = config.titleKo ?? ''
      titleKo.hidden = !config.titleKo
      credits.textContent = ''
      row('Student', config.student ?? config.artist)
      if (config.completedBy) row('Completed by', config.completedBy)
      count.textContent = `${pos.index + 1} / ${pos.total}`
      el.classList.add('open')
      open = true
    },
    hide() {
      el.classList.remove('open')
      open = false
    },
    isOpen: () => open,
    setAccent(hex) {
      el.style.setProperty('--accent', hex)
    },
  }
}
