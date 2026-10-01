<script setup lang="ts">
defineProps<{
  app: string;
  doc: string;
  accent: string;
  badge: string;
  undoActive?: boolean;
  undoHint?: string;
  exit?: boolean;
}>();
</script>

<template>
  <div class="demo-window" :class="{ 'demo-exit': exit }" :style="{ '--demo-accent': accent }">
    <div class="demo-bar">
      <span class="demo-badge" :style="{ background: badge }" />
      <span class="demo-doc">{{ doc }}</span>
      <span class="demo-app">{{ app }}</span>

      <div class="demo-tools">
        <span class="demo-tool" :class="{ on: undoActive }">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
          <span v-if="undoActive && undoHint" class="demo-tip">{{ undoHint }}</span>
        </span>
        <span class="demo-tool">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </span>
      </div>

      <div class="demo-winctl">
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 12h16" /></svg>
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><rect x="5" y="5" width="14" height="14" /></svg>
        <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </div>
    </div>

    <div class="demo-body">
      <div class="demo-doc-area">
        <slot name="doc" />
      </div>
      <slot name="pane" />
    </div>
  </div>
</template>
