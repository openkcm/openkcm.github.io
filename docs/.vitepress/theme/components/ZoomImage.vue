<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

defineProps<{
  src: string
  alt?: string
  caption?: string
}>()

const open = ref(false)

function close() {
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <figure class="zoom-image">
    <!-- Inline image -->
    <img
        :src="src"
        :alt="alt"
        class="zoom-thumb"
        role="button"
        tabindex="0"
        @click="open = true"
        @keydown.enter="open = true"
    />

    <figcaption v-if="caption">{{ caption }}</figcaption>

    <!-- Zoom overlay -->
    <teleport to="body">
      <div
          v-if="open"
          class="zoom-overlay"
          role="dialog"
          aria-modal="true"
          @click.self="close"
      >
        <button
            class="zoom-close"
            aria-label="Close image"
            @click="close"
        >
          ×
        </button>

        <img
            :src="src"
            :alt="alt"
            class="zoom-full"
        />
      </div>
    </teleport>
  </figure>
</template>