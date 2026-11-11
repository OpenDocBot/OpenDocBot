<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { withBase } from "vitepress";
import { useStageScale } from "./useStageScale";

const DESIGN_WIDTH = 860;
const DESIGN_HEIGHT = 460;
const PHASE_MS = [4400, 4400, 5200];
const TOTAL = PHASE_MS.reduce((total, value) => total + value, 0);

const root = ref<HTMLElement | null>(null);
const frame = ref<HTMLElement | null>(null);
const { scale } = useStageScale(frame, DESIGN_WIDTH);

const elapsed = ref(0);
const reduced = ref(false);
const active = ref(true);
const manual = ref(false);
const cycle = ref(0);

let inView = true;
let raf = 0;
let last = 0;
let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let onMedia: ((event: MediaQueryListEvent) => void) | null = null;
let onVisibility: (() => void) | null = null;

const phase = computed(() => {
  const first = PHASE_MS[0];
  const second = first + PHASE_MS[1];
  if (elapsed.value < first) return 0;
  if (elapsed.value < second) return 1;
  return 2;
});

const steps = [
  {
    n: "1/3",
    title: "Serve the add-in",
    text: "Office loads OpenDocBot from your hostname.",
  },
  {
    n: "2/3",
    title: "Push the managed configuration",
    text: "Provider, model and key, set once for everyone.",
  },
  {
    n: "3/3",
    title: "Talk to the provider",
    text: "Prompts go straight from Office to the model you chose.",
  },
];

const current = computed(() => steps[phase.value]);
const staticCaption = {
  title: "Server for the app. Direct for prompts.",
  text: "The add-in and configuration come from your server. Model prompts go straight to your provider.",
};

const pcs = [
  { top: 52, cy: 104, label: "PC 01", app: "Word", color: "#2b579a" },
  { top: 178, cy: 230, label: "PC 02", app: "Excel", color: "#217346" },
  { top: 304, cy: 356, label: "PC 03", app: "PowerPoint", color: "#d24726" },
];

const servePaths = [
  "M 240 235 C 280 235 290 104 330 104",
  "M 240 235 C 280 235 290 230 330 230",
  "M 240 235 C 280 235 290 356 330 356",
];

const promptPaths = [
  "M 540 104 C 590 104 600 235 650 235",
  "M 540 230 C 590 230 600 235 650 235",
  "M 540 356 C 590 356 600 235 650 235",
];

const activePaths = computed(() => (phase.value === 2 ? promptPaths : servePaths));
const logoMark = withBase("/logo-mark.svg");

function tick(now: number) {
  raf = requestAnimationFrame(tick);
  if (!active.value || reduced.value || manual.value) {
    last = now;
    return;
  }
  const dt = Math.min(now - last, 100);
  last = now;
  elapsed.value = (elapsed.value + dt) % TOTAL;
}

function updateActive() {
  active.value = inView && !document.hidden;
  last = performance.now();
}

function goTo(index: number) {
  const start = [0, PHASE_MS[0], PHASE_MS[0] + PHASE_MS[1]];
  const target = (index + steps.length) % steps.length;
  manual.value = true;
  elapsed.value = start[target];
  cycle.value += 1;
  last = performance.now();
  active.value = inView && !document.hidden;
}

function previous() {
  goTo(phase.value - 1);
}

function next() {
  goTo(phase.value + 1);
}

onMounted(() => {
  if (typeof window === "undefined") return;

  last = performance.now();
  raf = requestAnimationFrame(tick);

  if (typeof window.matchMedia === "function") {
    media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.value = media.matches;
    onMedia = (event) => {
      reduced.value = event.matches;
      if (!event.matches) manual.value = false;
      last = performance.now();
    };
    media.addEventListener("change", onMedia);
  }

  onVisibility = updateActive;
  document.addEventListener("visibilitychange", onVisibility);

  if (typeof IntersectionObserver !== "undefined" && root.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        updateActive();
      },
      { threshold: 0.2 },
    );
    observer.observe(root.value);
  }
});

onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  observer?.disconnect();
  if (media && onMedia) media.removeEventListener("change", onMedia);
  if (onVisibility) document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <figure
    ref="root"
    class="flow-demo"
    :class="{
      'phase-1': phase === 0,
      'phase-2': phase === 1,
      'phase-3': phase === 2,
      'flow-static': reduced,
    }"
  >
    <div class="flow-top">
      <span class="flow-top-title"><span class="flow-gt">&gt;</span> deployment flow</span>
      <div class="flow-progress" aria-hidden="true">
        <span
          v-for="(step, index) in steps"
          :key="step.n"
          :class="{ on: reduced || index === phase, done: !reduced && index < phase }"
        />
      </div>
      <div v-if="!reduced" class="flow-controls">
        <button
          type="button"
          class="flow-arrow"
          aria-label="Previous step"
          title="Previous step"
          @click="previous"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="flow-arrow"
          aria-label="Next step"
          title="Next step"
          @click="next"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
      </div>
    </div>

    <div class="flow-frame-wrap">
      <div ref="frame" class="flow-frame">
        <div class="flow-stage" :style="{ zoom: scale }" aria-hidden="true">
        <div class="flow-grid" />
        <svg class="flow-lines" :viewBox="`0 0 ${DESIGN_WIDTH} ${DESIGN_HEIGHT}`">
          <rect class="flow-boundary" x="24" y="34" width="536" height="392" rx="18" />

          <path
            v-for="(d, index) in servePaths"
            :key="`serve-${index}`"
            :d="d"
            class="flow-path serve-path"
            pathLength="100"
          />
          <path
            v-for="(d, index) in promptPaths"
            :key="`prompt-${index}`"
            :d="d"
            class="flow-path prompt-path"
            pathLength="100"
          />

          <g v-if="!reduced" :key="`${phase}-${cycle}`" class="flow-pulses">
            <path
              v-for="(d, index) in activePaths"
              :key="`pulse-${index}`"
              :d="d"
              class="flow-pulse"
              :class="{ config: phase === 1 }"
              pathLength="100"
              :style="{ animationDelay: `${index * -0.3}s` }"
            />
          </g>

          <circle cx="240" cy="235" r="3" class="flow-node" :class="{ on: reduced || phase < 2 }" />
          <circle cx="650" cy="235" r="3" class="flow-node" :class="{ on: reduced || phase === 2 }" />
          <circle
            v-for="pc in pcs"
            :key="`left-${pc.label}`"
            cx="330"
            :cy="pc.cy"
            r="2.5"
            class="flow-node small"
            :class="{ on: reduced || phase < 2 }"
          />
          <circle
            v-for="pc in pcs"
            :key="`right-${pc.label}`"
            cx="540"
            :cy="pc.cy"
            r="2.5"
            class="flow-node small"
            :class="{ on: reduced || phase === 2 }"
          />
        </svg>

        <div class="flow-label infra-label">YOUR INFRASTRUCTURE</div>
        <div class="flow-label provider-label">MODEL PROVIDER</div>

        <div class="flow-card server-card" :class="{ 'is-dim': !reduced && phase === 2 }">
          <div class="flow-card-head">
            <img class="flow-logo" :src="logoMark" alt="" />
            <span class="flow-kicker">SERVER</span>
            <span class="flow-dot" :class="{ on: reduced || phase < 2 }" />
          </div>
          <div class="flow-card-title">OpenDocBot</div>
          <div class="flow-url">addin.example.com</div>
          <div class="flow-meta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>TLS · SSO</span>
          </div>
        </div>

        <div
          v-for="pc in pcs"
          :key="pc.label"
          class="flow-card pc-card"
          :style="{ top: `${pc.top}px` }"
          :class="{ 'is-hot': reduced || phase === 2 }"
        >
          <div class="flow-pc-head">
            <span class="flow-pc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="18" height="12" rx="1.5" />
                <path d="M8 20h8M12 16v4" />
              </svg>
            </span>
            <span class="flow-pc-label">{{ pc.label }}</span>
            <span class="flow-app">
              <span class="flow-app-dot" :style="{ background: pc.color }" />
              {{ pc.app }}
            </span>
          </div>
          <div class="flow-chips">
            <span class="flow-chip chip-addin" :class="{ on: reduced || phase >= 0 }">ADD-IN</span>
            <span class="flow-chip chip-managed" :class="{ on: reduced || phase >= 1 }">MANAGED</span>
            <span class="flow-chip chip-prompt" :class="{ on: reduced || phase >= 2 }">PROMPT</span>
          </div>
        </div>

        <div class="flow-card provider-card" :class="{ 'is-hot': reduced || phase === 2 }">
          <div class="flow-card-head">
            <span class="flow-kicker">LLM GATEWAY</span>
            <span class="flow-dot" :class="{ on: reduced || phase === 2 }" />
          </div>
          <svg class="flow-cloud" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 18h9a4 4 0 0 0 .7-7.94A6 6 0 0 0 5.2 9.2 3.5 3.5 0 0 0 7 18Z" />
            <path d="M12 13v4m0 0 2-2m-2 2-2-2" />
          </svg>
          <div class="flow-card-title">Your provider</div>
          <div class="flow-meta">OpenAI · Bedrock · Ollama</div>
        </div>
        </div>
      </div>
    </div>

    <div class="flow-caption">
      <Transition name="flow-fade" mode="out-in">
        <div v-if="reduced" key="static" class="flow-caption-inner">
          <span class="flow-gt">&gt;</span>
          <span class="flow-step">FLOW</span>
          <span class="flow-caption-title">{{ staticCaption.title }}</span>
          <span class="flow-caption-text">{{ staticCaption.text }}</span>
        </div>
        <div v-else :key="phase" class="flow-caption-inner">
          <span class="flow-gt">&gt;</span>
          <span class="flow-step">{{ current.n }}</span>
          <span class="flow-caption-title">{{ current.title }}</span>
          <span class="flow-caption-text">{{ current.text }}</span>
        </div>
      </Transition>
    </div>

    <figcaption class="flow-sr">
      Diagram: your server serves the OpenDocBot add-in to three PCs, pushes the
      managed configuration, then the PCs send prompts directly to your model
      provider.
    </figcaption>
  </figure>
</template>

<style scoped>
.flow-demo {
  margin: 2rem 0;
}

.flow-top {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 860px;
  margin: 0 auto 10px;
}

.flow-top-title {
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.flow-gt {
  margin-right: 6px;
  color: var(--vp-c-brand-1);
}

.flow-progress {
  display: flex;
  gap: 4px;
  margin-left: auto;
}

.flow-progress span {
  width: 22px;
  height: 3px;
  border-radius: 2px;
  background: #232b23;
  transition: background 0.3s, box-shadow 0.3s;
}

.flow-progress span.done {
  background: rgba(61, 220, 132, 0.35);
}

.flow-progress span.on {
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 8px rgba(61, 220, 132, 0.55);
}

.flow-controls {
  display: flex;
  gap: 4px;
}

.flow-arrow {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.18s, border-color 0.18s, background 0.18s, transform 0.12s;
}

.flow-arrow svg {
  width: 13px;
  height: 13px;
}

.flow-arrow:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

.flow-arrow:active {
  transform: scale(0.96);
}

.flow-arrow:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.flow-frame-wrap {
  max-width: 860px;
  margin: 0 auto;
  scrollbar-width: thin;
  scrollbar-color: #2c352c transparent;
}

.flow-frame {
  position: relative;
  width: 100%;
  max-width: 860px;
  aspect-ratio: 860 / 460;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  background: #080a08;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 14px 34px rgba(0, 0, 0, 0.4);
}

.flow-stage {
  position: absolute;
  top: 0;
  left: 0;
  width: 860px;
  height: 460px;
  transform-origin: top left;
}

.flow-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(61, 220, 132, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(61, 220, 132, 0.035) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: radial-gradient(ellipse at center, black 25%, transparent 78%);
  pointer-events: none;
}

.flow-lines {
  position: absolute;
  inset: 0;
  width: 860px;
  height: 460px;
  overflow: visible;
}

.flow-boundary {
  fill: rgba(61, 220, 132, 0.018);
  stroke: #2a342a;
  stroke-width: 1;
  stroke-dasharray: 6 8;
}

.flow-path {
  fill: none;
  stroke: #263026;
  stroke-width: 1.4;
  transition: stroke 0.3s;
}

.phase-1 .serve-path,
.phase-2 .serve-path,
.flow-static .serve-path,
.flow-static .prompt-path {
  stroke: rgba(61, 220, 132, 0.42);
}

.phase-3 .prompt-path {
  stroke: rgba(61, 220, 132, 0.45);
}

.flow-pulse {
  fill: none;
  stroke: var(--vp-c-brand-1);
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-dasharray: 2 98;
  filter: drop-shadow(0 0 4px rgba(61, 220, 132, 0.75));
  animation: flow-dash 1.1s linear infinite;
}

.flow-pulse.config {
  stroke: #bff2cf;
  filter: drop-shadow(0 0 4px rgba(191, 242, 207, 0.55));
}

.flow-node {
  fill: #263026;
  transition: fill 0.3s, filter 0.3s;
}

.flow-node.small {
  opacity: 0.75;
}

.flow-node.on {
  fill: var(--vp-c-brand-1);
  filter: drop-shadow(0 0 5px rgba(61, 220, 132, 0.8));
}

.flow-card {
  position: absolute;
  box-sizing: border-box;
  padding: 12px 14px;
  border: 1px solid #263026;
  border-radius: 8px;
  background: #0a0c0a;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  font-family: var(--vp-font-family-mono);
  transition: border-color 0.35s, box-shadow 0.35s, opacity 0.35s;
}

.flow-card.is-hot {
  border-color: rgba(61, 220, 132, 0.45);
  box-shadow: 0 0 0 1px rgba(61, 220, 132, 0.1),
    0 0 26px rgba(61, 220, 132, 0.12), 0 12px 30px rgba(0, 0, 0, 0.35);
}

.phase-1 .server-card,
.phase-2 .server-card,
.flow-static .server-card {
  border-color: rgba(61, 220, 132, 0.35);
  box-shadow: 0 0 0 1px rgba(61, 220, 132, 0.08),
    0 0 22px rgba(61, 220, 132, 0.1), 0 12px 30px rgba(0, 0, 0, 0.35);
}

.phase-1 .pc-card,
.phase-2 .pc-card,
.flow-static .pc-card {
  border-color: rgba(61, 220, 132, 0.22);
}

.flow-card.is-dim {
  opacity: 0.5;
}

.server-card,
.provider-card {
  top: 160px;
  width: 190px;
  height: 150px;
}

.server-card {
  left: 50px;
}

.provider-card {
  left: 650px;
  width: 180px;
}

.pc-card {
  left: 330px;
  width: 210px;
  height: 104px;
}

.flow-card-head {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.flow-logo {
  display: block;
  width: 18px;
  height: 18px;
}

.flow-kicker {
  color: #6d7a6d;
  font-size: 8.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.flow-dot {
  width: 6px;
  height: 6px;
  margin-left: auto;
  border-radius: 50%;
  background: #273027;
  transition: background 0.3s, box-shadow 0.3s;
}

.flow-dot.on {
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 10px rgba(61, 220, 132, 0.85);
}

.flow-card-title {
  color: #e8ede8;
  font-size: 14px;
  font-weight: 700;
}

.flow-url {
  margin-top: 2px;
  color: #9aa69a;
  font-size: 10px;
}

.flow-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 10px;
  color: #6d7a6d;
  font-size: 9.5px;
}

.flow-meta svg {
  width: 12px;
  height: 12px;
  color: var(--vp-c-brand-1);
}

.flow-pc-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.flow-pc-icon {
  display: flex;
  color: #9aa69a;
}

.flow-pc-icon svg {
  width: 15px;
  height: 15px;
}

.flow-pc-label {
  color: #e8ede8;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.flow-app {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  color: #9aa69a;
  font-size: 9.5px;
}

.flow-app-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.flow-chips {
  display: flex;
  gap: 4px;
  margin-top: 12px;
}

.flow-chip {
  padding: 2px 4px;
  border: 1px solid #232b23;
  border-radius: 3px;
  color: #566256;
  font-size: 7.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  transition: color 0.3s, background 0.3s, border-color 0.3s;
}

.flow-chip.on {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
  color: #04120a;
}

.flow-cloud {
  display: block;
  width: 20px;
  height: 20px;
  margin: 4px 0 6px;
  color: var(--vp-c-brand-1);
}

.flow-label {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #5e6a5e;
  font-family: var(--vp-font-family-mono);
  font-size: 8px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.infra-label {
  top: 46px;
  left: 44px;
}

.infra-label::before {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 1px;
  background: var(--vp-c-brand-1);
}

.provider-label {
  top: 132px;
  left: 650px;
}

.flow-caption {
  display: flex;
  max-width: 860px;
  min-height: 38px;
  margin: 12px auto 0;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.55;
}

.flow-caption-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
}

.flow-step {
  color: var(--vp-c-brand-1);
  font-weight: 700;
  letter-spacing: 0.04em;
}

.flow-caption-title {
  color: var(--vp-c-text-1);
  font-weight: 700;
}

.flow-caption-text {
  color: var(--vp-c-text-3);
}

.flow-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.flow-fade-enter-active,
.flow-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.flow-fade-enter-from {
  opacity: 0;
  transform: translateY(3px);
}

.flow-fade-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

@keyframes flow-dash {
  from {
    stroke-dashoffset: 100;
  }
  to {
    stroke-dashoffset: 0;
  }
}

@media (max-width: 640px) {
  .flow-frame-wrap {
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
    padding-bottom: 4px;
  }

  .flow-frame {
    width: 620px;
    max-width: none;
    margin: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .flow-pulse {
    display: none;
  }

  .flow-fade-enter-active,
  .flow-fade-leave-active {
    transition: none;
  }
}
</style>
