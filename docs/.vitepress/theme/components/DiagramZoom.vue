<script setup lang="ts">
// Full-screen viewer for Mermaid diagrams.
// Every rendered diagram (`.vp-doc .mermaid`) opens here on click, Enter or Space.
// The viewer shows a copy of the diagram with zoom (buttons, mouse wheel, pinch)
// and pan (drag). The diagram markup on the page is never modified, so the
// Mermaid plugin can keep re-rendering it, for example on theme changes.
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'

const DIAGRAM_SELECTOR = '.vp-doc .mermaid'
const MIN_SCALE = 0.1
const MAX_SCALE = 12
const STEP = 1.25

const open = ref(false)
const svgMarkup = ref('')
const stage = ref<HTMLElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)

const view = reactive({ scale: 1, x: 0, y: 0, fit: 1 })
const natural = { width: 0, height: 0 }
const pointers = new Map<number, { x: number; y: number }>()
let pinchDistance = 0
let lastFocused: HTMLElement | null = null
let observer: MutationObserver | null = null

function percent() {
  return Math.round(view.scale * 100)
}

// Make diagrams reachable and announced as expandable by keyboard users.
function tagDiagrams() {
  document.querySelectorAll<HTMLElement>(DIAGRAM_SELECTOR).forEach((el) => {
    if (el.dataset.zoomable) return
    el.dataset.zoomable = 'true'
    el.tabIndex = 0
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', 'Expand diagram')
    el.title = 'Click to expand'
  })
}

function openDiagram(container: HTMLElement) {
  const svg = container.querySelector('svg')
  if (!svg) return

  // Give the copy unique element IDs; markers and styles refer to them.
  const id = svg.id || 'mermaid-diagram'
  const html = svg.outerHTML.split(id).join(`${id}-zoom`)

  const viewBox = svg.viewBox?.baseVal
  const rect = svg.getBoundingClientRect()
  natural.width = viewBox && viewBox.width ? viewBox.width : rect.width
  natural.height = viewBox && viewBox.height ? viewBox.height : rect.height

  lastFocused = container
  svgMarkup.value = html
  open.value = true
  document.documentElement.style.overflow = 'hidden'

  nextTick(() => {
    const copy = stage.value?.querySelector('svg')
    if (copy) {
      copy.removeAttribute('style')
      copy.setAttribute('width', String(natural.width))
      copy.setAttribute('height', String(natural.height))
    }
    fit()
    closeButton.value?.focus()
  })
}

function close() {
  open.value = false
  svgMarkup.value = ''
  pointers.clear()
  document.documentElement.style.overflow = ''
  lastFocused?.focus()
}

// Scale the diagram to fit the stage and center it.
function fit() {
  const el = stage.value
  if (!el || !natural.width || !natural.height) return
  const { width, height } = el.getBoundingClientRect()
  const scale = Math.min(width / natural.width, height / natural.height) * 0.95
  view.fit = scale
  view.scale = scale
  view.x = (width - natural.width * scale) / 2
  view.y = (height - natural.height * scale) / 2
}

function actualSize() {
  zoomTo(1)
}

// Zoom to `scale`, keeping the stage point (px, py) in place.
function zoomTo(scale: number, px?: number, py?: number) {
  const el = stage.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const cx = px ?? rect.width / 2
  const cy = py ?? rect.height / 2
  const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
  view.x = cx - ((cx - view.x) * next) / view.scale
  view.y = cy - ((cy - view.y) * next) / view.scale
  view.scale = next
}

function zoomIn() {
  zoomTo(view.scale * STEP)
}

function zoomOut() {
  zoomTo(view.scale / STEP)
}

function onWheel(event: WheelEvent) {
  const rect = stage.value!.getBoundingClientRect()
  const factor = Math.exp(-event.deltaY * 0.0015)
  zoomTo(view.scale * factor, event.clientX - rect.left, event.clientY - rect.top)
}

function onPointerDown(event: PointerEvent) {
  stage.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (pointers.size === 2) pinchDistance = distance()
}

function onPointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 1) {
    view.x += event.clientX - previous.x
    view.y += event.clientY - previous.y
  } else if (pointers.size === 2) {
    const current = distance()
    if (pinchDistance > 0) {
      const rect = stage.value!.getBoundingClientRect()
      const [a, b] = [...pointers.values()]
      zoomTo(
        (view.scale * current) / pinchDistance,
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top,
      )
    }
    pinchDistance = current
  }
}

function onPointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId)
  if (pointers.size < 2) pinchDistance = 0
}

function distance() {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function onDocumentClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (!target || target.closest('a')) return
  const diagram = target.closest<HTMLElement>(DIAGRAM_SELECTOR)
  if (diagram) openDiagram(diagram)
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (open.value) {
    if (event.key === 'Escape') close()
    else if (event.key === '+' || event.key === '=') zoomIn()
    else if (event.key === '-') zoomOut()
    else if (event.key === '0') fit()
    return
  }
  if (event.key !== 'Enter' && event.key !== ' ') return
  const target = event.target as HTMLElement | null
  if (target?.matches?.(DIAGRAM_SELECTOR)) {
    event.preventDefault()
    openDiagram(target)
  }
}

function onResize() {
  if (open.value) fit()
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', onResize)
  observer = new MutationObserver(tagDiagrams)
  observer.observe(document.body, { childList: true, subtree: true })
  tagDiagrams()
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', onResize)
  observer?.disconnect()
  document.documentElement.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="diagram-zoom"
      role="dialog"
      aria-modal="true"
      aria-label="Diagram viewer"
    >
      <div class="diagram-zoom-toolbar">
        <span class="diagram-zoom-hint">Drag to move · Scroll or pinch to zoom · Esc to close</span>
        <button type="button" aria-label="Zoom out" title="Zoom out (-)" @click="zoomOut">−</button>
        <span class="diagram-zoom-level" aria-live="polite">{{ percent() }}%</span>
        <button type="button" aria-label="Zoom in" title="Zoom in (+)" @click="zoomIn">+</button>
        <button type="button" title="Fit to screen (0)" @click="fit">Fit</button>
        <button type="button" title="Actual size" @click="actualSize">1:1</button>
        <button ref="closeButton" type="button" class="diagram-zoom-close" aria-label="Close" title="Close (Esc)" @click="close">×</button>
      </div>
      <div
        ref="stage"
        class="diagram-zoom-stage"
        @wheel.prevent="onWheel"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @dblclick="fit"
      >
        <div
          class="diagram-zoom-canvas"
          :style="{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }"
          v-html="svgMarkup"
        />
      </div>
    </div>
  </Teleport>
</template>
