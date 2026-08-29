<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
  <div class="vp-tab-panel">
    <slot />
  </div>
</template>