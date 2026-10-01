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

const DURATION = 8000;
const { t } = useTimeline({
  duration: DURATION,
  playing: computed(() => props.playing),
  initial: props.reduced ? 6600 : 0,
});

const PROMPT = "Insert a 3-point summary into the document";

const sent = computed(() => after(t.value, 2300));
const typedPrompt = computed(() => (sent.value ? "" : typed(PROMPT, t.value, 600, 2200)));
const thinking = computed(() => after(t.value, 2600) && !after(t.value, 5300));
const card = computed(() => after(t.value, 3000) && !after(t.value, 4800));
const approveClick = computed(() => t.value >= 4400 && t.value < 4660);
const status = computed(() =>
  after(t.value, 4800) && !after(t.value, 5900) ? "Inserting document summary..." : null,
);
const summary = computed(() => after(t.value, 5100) && !after(t.value, 6800));
const response = computed(() =>
  after(t.value, 6100) ? "Inserted the summary into the document." : null,
);
const undo = computed(() => after(t.value, 6100) && !after(t.value, 6800));
const exit = computed(() => after(t.value, DURATION - 500));
</script>

<template>
  <DemoWindow
    app="Word"
    doc="Q3 report.docx"
    accent="#2b579a"
    badge="#2b579a"
    :undo-active="undo"
    undo-hint="Undo (Ctrl+Z)"
    :exit="exit"
  >
    <template #doc>
      <div class="demo-doc-word">
        <div class="demo-page">
          <div class="demo-page-title">Q3 Engineering Report</div>
          <div class="demo-rule" />
          <p class="demo-page-para">
            Delivery slipped on three key milestones this quarter, driven by team capacity
            constraints in the platform group.
          </p>
          <p class="demo-page-para">
            Recommended actions include re-scoping milestone two and adding two senior engineers.
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

        <Transition name="demo-card">
          <div v-if="card" class="demo-approval">
            <div class="demo-approval-head">
              <span class="demo-approval-check">✓</span>
              <span>Action needs your approval</span>
            </div>
            <div class="demo-approval-body">
              <div class="demo-approval-title">Insert text</div>
              <div class="demo-approval-desc">Inserting a 3-point summary into the document</div>
              <div class="demo-approval-link">Show technical details</div>
              <div class="demo-approval-btns">
                <span class="demo-btn demo-btn-approve" :class="{ click: approveClick }">Approve</span>
                <span class="demo-btn demo-btn-reject">Reject</span>
              </div>
            </div>
          </div>
        </Transition>

        <div v-if="response" class="demo-response">{{ response }}</div>
      </DemoPane>
    </template>
  </DemoWindow>
</template>
