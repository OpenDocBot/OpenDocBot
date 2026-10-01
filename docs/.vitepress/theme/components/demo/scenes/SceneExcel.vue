<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import DemoWindow from "../DemoWindow.vue";
import DemoPane from "../DemoPane.vue";
import { after, typed, useTimeline } from "../useTimeline";

const props = defineProps<{ playing: boolean; reduced: boolean }>();

const logoUrl = withBase("/logo.svg");
const EMPTY = {
  title: "Analyze, write, or format your data.",
  hint: "Just describe what you want.",
};

const DURATION = 11000;
const { t } = useTimeline({
  duration: DURATION,
  playing: computed(() => props.playing),
  initial: props.reduced ? 7000 : 0,
});

const PROMPT = "Add a Total column with a formula and chart it";
const rows = [
  { name: "Software", a: "$4,200", b: "$3,800", total: "$8,000" },
  { name: "Hardware", a: "$3,100", b: "$2,900", total: "$6,000" },
  { name: "Services", a: "$1,800", b: "$2,200", total: "$4,000" },
];

const sent = computed(() => after(t.value, 2300));
const typedPrompt = computed(() => (sent.value ? "" : typed(PROMPT, t.value, 600, 2200)));
const thinking = computed(() => after(t.value, 2600) && !after(t.value, 5300));
const status = computed(() => {
  if (t.value >= 3100 && t.value < 4200) return "Adding a formula to column D...";
  if (t.value >= 4400 && t.value < 5400) return "Inserting a chart...";
  return null;
});
const total = computed(() => after(t.value, 3500));
const chart = computed(() => after(t.value, 4500));
const response = computed(() =>
  after(t.value, 5700) ? "Added a Total column with =SUM formulas and a bar chart." : null,
);
const exit = computed(() => after(t.value, DURATION - 500));
</script>

<template>
  <DemoWindow app="Excel" doc="Q3 budget.xlsx" accent="#217346" badge="#217346" :exit="exit">
    <template #doc>
      <div class="demo-doc-excel">
        <div class="demo-xl-name">
          <span class="box">{{ total ? "D2" : "A1" }}</span>
          <span class="fx">fx</span>
          <span class="demo-xl-fx">{{ total ? "=SUM(B2:C2)" : "\u00A0" }}</span>
        </div>
        <div class="demo-xl-grid">
          <div class="demo-xl-row demo-xl-head">
            <div class="demo-xl-cell demo-xl-corner" />
            <div class="demo-xl-cell">Category</div>
            <div class="demo-xl-cell">Q1</div>
            <div class="demo-xl-cell">Q2</div>
            <div class="demo-xl-cell g" :class="{ in: total }">Total</div>
          </div>
          <div v-for="(r, i) in rows" :key="r.name" class="demo-xl-row">
            <div class="demo-xl-cell demo-xl-rownum">{{ i + 2 }}</div>
            <div class="demo-xl-cell">{{ r.name }}</div>
            <div class="demo-xl-cell">{{ r.a }}</div>
            <div class="demo-xl-cell">{{ r.b }}</div>
            <div class="demo-xl-cell total" :class="{ in: total, hi: total }">{{ r.total }}</div>
          </div>
          <div v-for="n in 14" :key="`empty-${n}`" class="demo-xl-row">
            <div class="demo-xl-cell demo-xl-rownum">{{ n + 4 }}</div>
            <div class="demo-xl-cell" />
            <div class="demo-xl-cell" />
            <div class="demo-xl-cell" />
            <div class="demo-xl-cell total" :class="{ in: total }" />
          </div>
        </div>

        <div class="demo-chart" :class="{ in: chart }">
          <div class="demo-chart-title">Total by category</div>
          <svg viewBox="0 0 360 168">
            <line x1="16" y1="140" x2="344" y2="140" stroke="#cfd6cf" stroke-width="1" />
            <rect class="bar" x="40" y="16" width="60" height="124" />
            <rect class="bar" x="150" y="45" width="60" height="95" />
            <rect class="bar" x="260" y="76" width="60" height="64" />
            <text x="70" y="13" text-anchor="middle" class="demo-chart-val" fill="#0e5b2f">$8,000</text>
            <text x="180" y="42" text-anchor="middle" class="demo-chart-val" fill="#0e5b2f">$6,000</text>
            <text x="290" y="73" text-anchor="middle" class="demo-chart-val" fill="#0e5b2f">$4,000</text>
            <text x="70" y="156" text-anchor="middle" class="demo-chart-cat" fill="#5a655a">Software</text>
            <text x="180" y="156" text-anchor="middle" class="demo-chart-cat" fill="#5a655a">Hardware</text>
            <text x="290" y="156" text-anchor="middle" class="demo-chart-cat" fill="#5a655a">Services</text>
          </svg>
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
