<script setup lang="ts">
defineProps<{
  src: string
  alt?: string
}>()
</script>

<template>
  <details class="zoom-image">
    <summary class="zoom-button">+</summary>

    <div class="zoom-overlay">
      <img :src="src" :alt="alt" />
    </div>
  </details>
</template>
