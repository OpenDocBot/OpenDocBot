<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, type Component } from "vue";
import "@fontsource-variable/jetbrains-mono";
import "./demo.css";
import SceneExcel from "./scenes/SceneExcel.vue";
import SceneWord from "./scenes/SceneWord.vue";
import SceneSlides from "./scenes/SceneSlides.vue";
import SceneProvider from "./scenes/SceneProvider.vue";
import SceneHitl from "./scenes/SceneHitl.vue";
import { useStageScale } from "./useStageScale";

interface Scenario {
  id: string;
  label: string;
  caption: string;
  component: Component;
}

const scenarios: Scenario[] = [
  { id: "excel", label: "Excel", caption: "Excel · edit a sheet by prompt", component: SceneExcel },
  { id: "word", label: "Word", caption: "Word · draft & summarize", component: SceneWord },
  { id: "pptx", label: "PowerPoint", caption: "PowerPoint · build a deck from notes", component: SceneSlides },
  { id: "provider", label: "Provider setup", caption: "Provider setup · bring your own key", component: SceneProvider },
  { id: "hitl", label: "Human in the loop", caption: "Human in the loop · approve, reject or undo", component: SceneHitl },
];

// Client-only gate: the demo is pure browser animation, so skip SSR entirely.
const mounted = ref(false);
const active = ref("excel");
const current = computed(() => scenarios.find((s) => s.id === active.value) ?? scenarios[0]);

const reduced = ref(
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false,
);
const inView = ref(true);
const hidden = ref(false);
const playing = computed(() => !reduced.value && inView.value && !hidden.value);

const frame = ref<HTMLElement | null>(null);
const { scale } = useStageScale(frame, 1000);

let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let onMedia: ((e: MediaQueryListEvent) => void) | null = null;
let onVisibility: (() => void) | null = null;

function select(id: string) {
  active.value = id;
}

onMounted(() => {
  mounted.value = true;

  if (typeof window.matchMedia === "function") {
    media = window.matchMedia("(prefers-reduced-motion: reduce)");
    onMedia = (e) => (reduced.value = e.matches);
    media.addEventListener("change", onMedia);
  }

  onVisibility = () => (hidden.value = document.hidden);
  document.addEventListener("visibilitychange", onVisibility);

  if (typeof IntersectionObserver !== "undefined" && frame.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        inView.value = entry.isIntersecting;
      },
      { threshold: 0.15 },
    );
    observer.observe(frame.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  if (media && onMedia) media.removeEventListener("change", onMedia);
  if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <div v-if="mounted" class="hero-demo-root">
    <div class="hero-demo-tabs">
      <button
        v-for="s in scenarios"
        :key="s.id"
        type="button"
        class="hero-demo-tab"
        :class="{ on: s.id === active }"
        :aria-pressed="s.id === active"
        @click="select(s.id)"
      >
        <span class="gt">&gt;</span>{{ s.label }}
      </button>
    </div>

    <div ref="frame" class="hero-demo">
      <div
        class="hero-demo-stage"
        :class="{ 'demo-reduced': reduced }"
        :style="{ zoom: scale }"
      >
        <component :is="current.component" :key="current.id" :playing="playing" :reduced="reduced" />
      </div>
    </div>

    <div class="hero-demo-caption"><span class="gt">&gt;</span>{{ current.caption }}</div>
  </div>
</template>
