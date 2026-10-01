<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import DemoWindow from "../DemoWindow.vue";
import DemoPane from "../DemoPane.vue";
import { after, typed, useTimeline } from "../useTimeline";

const props = defineProps<{ playing: boolean; reduced: boolean }>();

const logoUrl = withBase("/logo.svg");
const EMPTY = {
  title: "Build, edit, or polish your slides.",
  hint: "Just describe what you want.",
};

const DURATION = 12000;
const { t } = useTimeline({
  duration: DURATION,
  playing: computed(() => props.playing),
  initial: props.reduced ? 7400 : 0,
});

const PROMPT = "Build a slide deck from these meeting notes";
const FILE = "meeting_notes.txt";
const FILE_SIZE = "4.2 KB";

const sent = computed(() => after(t.value, 2300));
const typedPrompt = computed(() => (sent.value ? "" : typed(PROMPT, t.value, 600, 2200)));
const thinking = computed(() => after(t.value, 2600) && !after(t.value, 6900));
const status = computed(() =>
  after(t.value, 3100) && !after(t.value, 6800) ? "Building a 3-slide deck..." : null,
);
const built = computed(() => after(t.value, 3400));
const activeIndex = computed(() => (t.value < 5000 ? 0 : t.value < 6600 ? 1 : 2));
const count = computed(() => (built.value ? activeIndex.value + 1 : 1));
// Thumbnails appear as slides are built: one blank to begin with, then more.
const thumbCount = computed(() => (built.value ? activeIndex.value + 1 : 1));
const response = computed(() =>
  after(t.value, 7100) ? "Built a 3-slide deck from meeting_notes.txt." : null,
);
const exit = computed(() => after(t.value, DURATION - 500));
</script>

<template>
  <DemoWindow app="PowerPoint" doc="Roadmap.pptx" accent="#d24726" badge="#d24726" :exit="exit">
    <template #doc>
      <div class="demo-doc-ppt">
        <div class="demo-ppt-rail">
          <div
            v-for="i in thumbCount"
            :key="i"
            class="demo-ppt-thumb"
            :class="{ on: built && i - 1 === activeIndex }"
          >
            {{ i }}
          </div>
        </div>
        <div class="demo-ppt-main">
          <!-- Empty presentation before the deck is built -->
          <div v-if="!built" class="demo-slide demo-slide-blank" />

          <!-- Slide 1: title -->
          <div v-else-if="activeIndex === 0" key="0" class="demo-slide demo-slide-title">
            <div class="deck-kicker">Team offsite</div>
            <div class="deck-hero">Q3 Planning</div>
            <div class="deck-rule" />
            <div class="deck-sub">Drafted from meeting_notes.txt</div>
            <div class="deck-dots" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          </div>

          <!-- Slide 2: stats -->
          <div v-else-if="activeIndex === 1" key="1" class="demo-slide">
            <div class="deck-title">Where we are</div>
            <div class="deck-rule" />
            <div class="deck-stats">
              <div class="deck-stat">
                <div class="deck-num">8</div>
                <div class="deck-lbl">providers</div>
              </div>
              <div class="deck-stat">
                <div class="deck-num">3</div>
                <div class="deck-lbl">Office apps</div>
              </div>
              <div class="deck-stat">
                <div class="deck-num">0</div>
                <div class="deck-lbl">servers</div>
              </div>
            </div>
          </div>

          <!-- Slide 3: next steps -->
          <div v-else key="2" class="demo-slide">
            <div class="deck-title">Next steps</div>
            <div class="deck-rule" />
            <div class="deck-steps">
              <div class="deck-step">
                <span class="deck-idx">01</span><span class="deck-txt">Ship managed config &amp; SSO</span>
              </div>
              <div class="deck-step">
                <span class="deck-idx">02</span><span class="deck-txt">Open the marketplace listing</span>
              </div>
              <div class="deck-step">
                <span class="deck-idx">03</span><span class="deck-txt">Grow the early-access community</span>
              </div>
            </div>
          </div>

          <div v-if="built" class="demo-ppt-count">slide <b>{{ count }}</b> / 3</div>
        </div>
      </div>
    </template>

    <template #pane>
      <DemoPane :status="status" :typed="typedPrompt" :typing="!sent" :show-input="true">
        <template #top>
          <div v-if="!sent" class="demo-attach">
            <div class="demo-attach-head">Attachments · 1</div>
            <div class="demo-attach-row">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
                <path d="M10 9H8" />
                <path d="M16 13H8" />
                <path d="M16 17H8" />
              </svg>
              <span class="demo-attach-name">{{ FILE }}</span>
              <span class="demo-attach-size">{{ FILE_SIZE }}</span>
              <span class="demo-attach-x">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </span>
            </div>
          </div>
        </template>

        <div v-if="!sent" class="demo-empty">
          <p class="demo-empty-logo"><img :src="logoUrl" alt="OpenDocBot" /></p>
          <p class="demo-empty-title">{{ EMPTY.title }}</p>
          <p class="demo-empty-hint">{{ EMPTY.hint }}</p>
          <p class="demo-empty-dash">_</p>
        </div>

        <div v-if="sent" class="demo-msg">
          <span class="demo-gt">❯</span>{{ PROMPT }}
          <div class="demo-msg-attach">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
            </svg>
            <span>{{ FILE }}</span>
          </div>
        </div>
        <div v-if="thinking" class="demo-thinking">▸ thinking</div>
        <div v-if="response" class="demo-response">{{ response }}</div>
      </DemoPane>
    </template>
  </DemoWindow>
</template>
