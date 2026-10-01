<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import DemoWindow from "../DemoWindow.vue";
import DemoPane from "../DemoPane.vue";
import { after, typed, useTimeline } from "../useTimeline";

const props = defineProps<{ playing: boolean; reduced: boolean }>();

const logoUrl = withBase("/logo.svg");
const EMPTY = {
  title: "Write, edit, or format this document.",
  hint: "Just describe what you want.",
};

const DURATION = 10000;
const { t } = useTimeline({
  duration: DURATION,
  playing: computed(() => props.playing),
  initial: props.reduced ? 7000 : 0,
});

const PROMPT = "Summarize this report into 3 bullets";

const sent = computed(() => after(t.value, 2300));
const typedPrompt = computed(() => (sent.value ? "" : typed(PROMPT, t.value, 600, 2200)));
const thinking = computed(() => after(t.value, 2600) && !after(t.value, 5300));
const status = computed(() =>
  after(t.value, 3100) && !after(t.value, 5500) ? "Inserting document summary..." : null,
);
const summary = computed(() => after(t.value, 3500));
const response = computed(() =>
  after(t.value, 5700) ? "Inserted a 3-point summary into the document." : null,
);
const exit = computed(() => after(t.value, DURATION - 500));
</script>

<template>
  <DemoWindow app="Word" doc="Q3 report.docx" accent="#2b579a" badge="#2b579a" :exit="exit">
    <template #doc>
      <div class="demo-doc-word">
        <div class="demo-page">
          <div class="demo-page-title">Q3 Engineering Report</div>
          <div class="demo-rule" />
          <p class="demo-page-para">
            Delivery slipped on <span class="demo-hl">three key milestones</span> this quarter,
            driven by team capacity constraints in the platform group.
          </p>
          <p class="demo-page-para">
            Recommended actions include re-scoping milestone two and adding two senior engineers to
            the critical path.
          </p>
          <ul class="demo-summary" :class="{ in: summary }">
            <b>Summary</b>
            <li>3 deliverables slipped to Q4</li>
            <li>Capacity is the main constraint</li>
            <li>Re-scope milestone 2 recommended</li>
          </ul>
        </div>
      </div>
    </template>

    <template #pane>
      <DemoPane :status="status" :typed="typedPrompt" :typing="!sent" :show-input="true">
        <div v-if="!sent" class="demo-empty">
          <p class="demo-empty-logo"><img :src="logoUrl" alt="OpenDocBot" /></p>
          <p class="demo-empty-title">{{ EMPTY.title }}</p>
          <p class="demo-empty-hint">{{ EMPTY.hint }}</p>
          <p class="demo-empty-dash">_</p>
        </div>
        <div v-if="sent" class="demo-msg"><span class="demo-gt">❯</span>{{ PROMPT }}</div>
        <div v-if="thinking" class="demo-thinking">▸ thinking</div>
        <div v-if="response" class="demo-response">{{ response }}</div>
      </DemoPane>
    </template>
  </DemoWindow>
</template>
