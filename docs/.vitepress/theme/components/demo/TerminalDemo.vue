<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

type LineKind =
  | "cmd"
  | "header"
  | "dim"
  | "step"
  | "ok"
  | "info"
  | "prompt"
  | "summary"
  | "plain";

interface Line {
  text: string;
  kind: LineKind;
  delay: number;
}

const lines: Line[] = [
  { kind: "cmd", text: "$ git clone https://github.com/OpenDocBot/OpenDocBot.git", delay: 200 },
  { kind: "cmd", text: "$ cd OpenDocBot", delay: 900 },
  { kind: "cmd", text: "$ ./setup.sh", delay: 1300 },
  { kind: "plain", text: "", delay: 2000 },
  { kind: "header", text: "  > OpenDocBot", delay: 2200 },
  { kind: "dim", text: "    self-hosting setup", delay: 2350 },
  { kind: "plain", text: "", delay: 2500 },
  { kind: "step", text: "  1/5  Address and certificate", delay: 2700 },
  { kind: "info", text: "  · Detected address: 192.168.1.10", delay: 3000 },
  { kind: "prompt", text: "  ? Use this address? [Y/n] y", delay: 3400 },
  { kind: "info", text: "  · Add-in URL: https://192.168.1.10", delay: 3800 },
  { kind: "ok", text: "  ✓ generated a self-signed certificate for 192.168.1.10", delay: 4200 },
  { kind: "plain", text: "", delay: 4600 },
  { kind: "step", text: "  2/5  Configuration", delay: 4800 },
  { kind: "ok", text: "  ✓ generated OPENDOCBOT_SESSION_SECRET", delay: 5100 },
  { kind: "ok", text: "  ✓ .env written (mode 0600)", delay: 5400 },
  { kind: "plain", text: "", delay: 5700 },
  { kind: "step", text: "  3/5  Manifest", delay: 5900 },
  { kind: "ok", text: "  ✓ manifest written to dist/manifest.xml", delay: 6200 },
  { kind: "plain", text: "", delay: 6500 },
  { kind: "step", text: "  4/5  Deployment summary", delay: 6700 },
  { kind: "summary", text: "  URL          https://192.168.1.10", delay: 7000 },
  { kind: "summary", text: "  Certificate  certs/addin.crt", delay: 7250 },
  { kind: "plain", text: "", delay: 7500 },
  { kind: "step", text: "  5/5  Starting", delay: 7700 },
  { kind: "ok", text: "  ✓ container is healthy", delay: 8100 },
  { kind: "ok", text: "  ✓ verified https://192.168.1.10/", delay: 8500 },
  { kind: "plain", text: "", delay: 8900 },
  { kind: "header", text: "  > Setup complete.", delay: 9200 },
];

const transcript = computed(() => lines.map((line) => line.text).join("\n"));
const root = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const visibleCount = ref(0);
const visibleLines = computed(() => lines.slice(0, visibleCount.value));
const reduced = ref(false);

let observer: IntersectionObserver | null = null;
let media: MediaQueryList | null = null;
let onMedia: ((event: MediaQueryListEvent) => void) | null = null;
const timers: number[] = [];

function clearTimers() {
  for (const timer of timers) window.clearTimeout(timer);
  timers.length = 0;
}

watch(visibleCount, async () => {
  await nextTick();
  if (!body.value) return;
  body.value.scrollTop = reduced.value ? 0 : body.value.scrollHeight;
});

function play() {
  observer?.disconnect();
  observer = null;
  clearTimers();
  visibleCount.value = 0;

  if (reduced.value) {
    visibleCount.value = lines.length;
    return;
  }

  lines.forEach((line, index) => {
    timers.push(
      window.setTimeout(() => {
        visibleCount.value = index + 1;
      }, line.delay),
    );
  });
}

onMounted(() => {
  if (typeof window === "undefined") return;

  if (typeof window.matchMedia === "function") {
    media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduced.value = media.matches;
    onMedia = (event) => {
      reduced.value = event.matches;
      if (event.matches) {
        clearTimers();
        visibleCount.value = lines.length;
      } else {
        play();
      }
    };
    media.addEventListener("change", onMedia);
  }

  if (reduced.value) {
    visibleCount.value = lines.length;
    return;
  }

  if (typeof IntersectionObserver === "undefined") {
    play();
    return;
  }

  if (root.value) {
    const rect = root.value.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      play();
      return;
    }

    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        play();
      },
      { threshold: 0.15 },
    );
    observer.observe(root.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  clearTimers();
  if (media && onMedia) media.removeEventListener("change", onMedia);
});
</script>

<template>
  <figure ref="root" class="term-demo" :class="{ 'term-static': reduced }">
    <div class="term-head">
      <span class="term-dots" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span class="term-title">opendocbot setup</span>
      <button v-if="!reduced" type="button" class="term-replay" @click="play">
        Replay
      </button>
    </div>

    <div ref="body" class="term-body" aria-hidden="true">
      <TransitionGroup name="term-line" tag="div" class="term-lines">
        <div
          v-for="(line, index) in visibleLines"
          :key="index"
          class="term-line"
          :class="`term-${line.kind}`"
        ><span class="term-text">{{ line.text }}</span><span
          v-if="index === visibleLines.length - 1"
          class="term-cursor"
        /></div>
      </TransitionGroup>
    </div>

    <figcaption class="term-sr">{{ transcript }}</figcaption>
  </figure>
</template>

<style scoped>
.term-demo {
  margin: 2rem 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 6px;
  background: #070a07;
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 14px 34px rgba(0, 0, 0, 0.4);
}

.term-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg-alt);
}

.term-dots {
  display: flex;
  gap: 5px;
}

.term-dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #273027;
}

.term-title {
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  letter-spacing: 0.03em;
}

.term-replay {
  appearance: none;
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
  transition: color 0.18s, border-color 0.18s;
}

.term-replay:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.term-body {
  height: 400px;
  padding: 14px 16px 16px;
  overflow-x: auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: #2c352c transparent;
  color: var(--vp-c-text-2);
  font-family: var(--vp-font-family-mono);
  font-size: 12px;
  line-height: 1.65;
}

.term-line {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.term-text {
  white-space: pre-wrap;
}

.term-cmd {
  color: var(--vp-c-text-1);
}

.term-header {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}

.term-dim {
  color: var(--vp-c-text-3);
}

.term-step {
  margin-top: 3px;
  color: var(--vp-c-text-1);
  font-weight: 700;
}

.term-ok {
  color: #bff2cf;
}

.term-info {
  color: var(--vp-c-text-3);
}

.term-prompt,
.term-summary {
  color: var(--vp-c-text-2);
}

.term-cursor {
  display: inline-block;
  width: 6px;
  height: 12px;
  margin-left: 2px;
  vertical-align: -1px;
  background: var(--vp-c-brand-1);
  animation: term-blink 1s steps(1) infinite;
}

.term-line-enter-active {
  animation: term-line-in 0.18s ease both;
}

.term-sr {
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

@keyframes term-line-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes term-blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0;
  }
}

@media (max-width: 640px) {
  .term-body {
    height: 340px;
    padding: 12px;
    font-size: 11px;
  }

  .term-summary {
    font-size: 10.5px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .term-line-enter-active,
  .term-cursor {
    animation: none !important;
  }
}
</style>
