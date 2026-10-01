<script setup lang="ts">
withDefaults(
  defineProps<{
    status?: string | null;
    typed?: string;
    typing?: boolean;
    showInput?: boolean;
    placeholder?: string;
    view?: "chat" | "settings" | "welcome";
  }>(),
  {
    status: null,
    typed: "",
    typing: false,
    showInput: true,
    placeholder: "Type your request...",
    view: "chat",
  },
);
</script>

<template>
  <aside class="demo-pane">
    <div class="demo-pane-head">
      <span class="demo-pane-logo"><span class="demo-gt">&gt;</span>ODB</span>
      <span class="demo-pane-ver">v1.0.0</span>
      <span class="demo-pane-icons">
        <!-- Suggestion mode (MessageSquareText) -->
        <svg
          v-if="view === 'chat'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z" />
          <path d="M7 11h10" />
          <path d="M7 15h6" />
          <path d="M7 7h8" />
        </svg>
        <!-- Clear conversation (Trash2) -->
        <svg
          v-if="view === 'chat'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
          <path d="M3 6h18" />
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        </svg>
        <!-- Export / import settings (FileCog) -->
        <svg
          v-if="view === 'settings'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M15 8a1 1 0 0 1-1-1V2a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8z" />
          <path d="M20 8v12a2 2 0 0 1-2 2h-4.182" />
          <path d="m3.305 19.53.923-.382" />
          <path d="M4 10.592V4a2 2 0 0 1 2-2h8" />
          <path d="m4.228 16.852-.924-.383" />
          <path d="m5.852 15.228-.383-.923" />
          <path d="m5.852 20.772-.383.924" />
          <path d="m8.148 15.228.383-.923" />
          <path d="m8.53 21.696-.382-.924" />
          <path d="m9.773 16.852.922-.383" />
          <path d="m9.773 19.148.922.383" />
          <circle cx="7" cy="18" r="3" />
        </svg>
        <!-- Settings (Settings) -->
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </span>
    </div>

    <slot name="top" />

    <div class="demo-pane-body">
      <slot />
    </div>

    <div v-if="status" class="demo-status" :class="{ 'demo-status--input': showInput }">
      <span class="demo-sq" />
      <span class="demo-gt">$</span>
      <span>{{ status }}</span>
    </div>

    <div v-if="showInput" class="demo-input">
      <span class="demo-caret">❯</span>
      <span v-if="typing || typed" class="demo-typed">{{ typed }}<span v-if="typing" class="demo-typing-caret" /></span>
      <span v-else class="demo-placeholder">{{ placeholder }}</span>
      <span class="demo-send">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M7 2l15 10-15 10V2z" />
        </svg>
      </span>
    </div>
  </aside>
</template>
