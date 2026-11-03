import type { GalleryItem } from './artwork.ts'

export interface ToolUI {
  photoBtn: HTMLButtonElement
  tourBtn: HTMLButtonElement
  listBtn: HTMLButtonElement
  feelBtn: HTMLButtonElement
  listPanel: HTMLDivElement
  setTourActive: (active: boolean) => void
  setPhotoDisabled: (disabled: boolean) => void
  renderList: (
    items: GalleryItem[],
    activeId: string | null,
    onPick: (item: GalleryItem) => void,
  ) => void
  setActiveItem: (id: string | null) => void
}

export function createTools(opts: {
  onPhoto: () => void
  onTour: () => void
  onStopTour: () => void
  onFeel: () => void
}): ToolUI {
  const row = document.createElement('div')
  row.className = 'tool-row ui'

  const photoBtn = document.createElement('button')
  photoBtn.className = 'tool'
  photoBtn.textContent = 'PHOTO'
  photoBtn.title = 'Save a screenshot of the gallery'

  const tourBtn = document.createElement('button')
  tourBtn.className = 'tool'
  tourBtn.textContent = 'TOUR'
  tourBtn.title = 'Cinematic flythrough of every piece'

  const listBtn = document.createElement('button')
  listBtn.className = 'tool'
  listBtn.textContent = 'LIST'
  listBtn.title = 'Browse all pieces'

  const feelBtn = document.createElement('button')
  feelBtn.className = 'tool feel'
  feelBtn.textContent = 'MOOD'
  feelBtn.title = 'Tell us the mood — EchoBloom senses it and shifts the gallery to match'
  feelBtn.setAttribute('aria-haspopup', 'dialog')

  listBtn.setAttribute('aria-expanded', 'false')
  listBtn.setAttribute('aria-controls', 'list-panel')

  const listPanel = document.createElement('div')
  listPanel.id = 'list-panel'
  listPanel.className = 'hidden ui'

  const listTitle = document.createElement('div')
  listTitle.className = 'panel-title'
  listTitle.textContent = 'Pieces'
  listPanel.appendChild(listTitle)

  const list = document.createElement('div')
  list.id = 'piece-list'
  listPanel.appendChild(list)

  const rows = new Map<string, HTMLButtonElement>()

  photoBtn.addEventListener('click', () => {
    // aria-disabled keeps the button focusable, so the click itself has to be blocked.
    if (photoBtn.getAttribute('aria-disabled') === 'true') return
    opts.onPhoto()
  })
  tourBtn.addEventListener('click', () => {
    if (tourBtn.classList.contains('active')) opts.onStopTour()
    else opts.onTour()
  })
  function closeList() {
    listPanel.classList.add('hidden')
    listBtn.setAttribute('aria-expanded', 'false')
  }
  listBtn.addEventListener('click', () => {
    const hidden = listPanel.classList.toggle('hidden')
    listBtn.setAttribute('aria-expanded', String(!hidden))
    // Opening the panel moves focus to the first piece.
    if (!hidden) list.querySelector<HTMLButtonElement>('.list-item')?.focus({ preventScroll: true })
  })
  // Escape closes the panel and returns focus to LIST, from the panel or from the LIST button.
  function onListEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape' || listPanel.classList.contains('hidden')) return
    closeList()
    listBtn.focus({ preventScroll: true })
  }
  listPanel.addEventListener('keydown', onListEscape)
  listBtn.addEventListener('keydown', onListEscape)
  feelBtn.addEventListener('click', opts.onFeel)

  // Up and Down step through the pieces, wrapping at the ends.
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    const items = Array.from(list.querySelectorAll<HTMLButtonElement>('.list-item'))
    const at = items.indexOf(document.activeElement as HTMLButtonElement)
    if (at === -1) return
    e.preventDefault()
    const step = e.key === 'ArrowDown' ? 1 : -1
    items[(at + step + items.length) % items.length].focus({ preventScroll: true })
  })

  row.append(photoBtn, tourBtn, listBtn, feelBtn)
  document.body.append(row, listPanel)

  function renderList(
    items: GalleryItem[],
    activeId: string | null,
    onPick: (item: GalleryItem) => void,
  ) {
    list.textContent = ''
    rows.clear()
    for (const item of items) {
      const btn = document.createElement('button')
      btn.className = 'list-item'
      const dot = document.createElement('span')
      dot.className = 'list-dot'
      dot.setAttribute('aria-hidden', 'true')
      if (item.type === 'artwork') {
        dot.style.background = `linear-gradient(135deg, hsl(${item.colors[0]} 90% 55%), hsl(${item.colors[1]} 90% 65%))`
      } else {
        dot.style.background = 'linear-gradient(135deg, #6a6a78, #9a9aa8)'
      }
      const text = document.createElement('span')
      text.textContent = `${item.title}`
      const meta = document.createElement('span')
      meta.className = 'list-artist'
      meta.textContent = item.artist
      btn.append(dot, text, meta)
      btn.addEventListener('click', () => {
        onPick(item)
        // On a phone the open panel hides the piece you just picked.
        if (window.matchMedia('(max-width: 640px)').matches) closeList()
      })
      rows.set(item.id, btn)
      list.appendChild(btn)
    }
    setActiveItem(activeId)
  }

  function setActiveItem(id: string | null) {
    for (const [rowId, btn] of rows) btn.classList.toggle('active', rowId === id)
  }

  return {
    photoBtn,
    tourBtn,
    listBtn,
    feelBtn,
    listPanel,
    setTourActive(active) {
      tourBtn.classList.toggle('active', active)
      tourBtn.textContent = active ? 'END TOUR' : 'TOUR'
    },
    setPhotoDisabled(disabled) {
      photoBtn.classList.toggle('disabled', disabled)
      photoBtn.setAttribute('aria-disabled', String(disabled))
      photoBtn.title = disabled
        ? 'Photo mode is not available in VR'
        : 'Save a screenshot of the gallery'
    },
    renderList,
    setActiveItem,
  }
}
