<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import DemoWindow from "../DemoWindow.vue";
import DemoPane from "../DemoPane.vue";
import { after, useTimeline } from "../useTimeline";

const props = defineProps<{ playing: boolean; reduced: boolean }>();

const logoUrl = withBase("/logo.svg");

const DURATION = 11000;
const { t } = useTimeline({
  duration: DURATION,
  playing: computed(() => props.playing),
  initial: props.reduced ? 6400 : 0,
});

const KEY_LEN = 24;

const settingsOpen = computed(() => after(t.value, 1700));
const view = computed(() => (settingsOpen.value ? "settings" : "welcome"));

const ctaClick = computed(() => t.value >= 1050 && t.value < 1310);
const keyDots = computed(() => {
  const p = Math.max(0, Math.min(1, (t.value - 2100) / 1400));
  return "•".repeat(Math.round(p * KEY_LEN));
});
const typingKey = computed(() => keyDots.value.length > 0 && keyDots.value.length < KEY_LEN);
const testClick = computed(() => t.value >= 4100 && t.value < 4360);
const testing = computed(() => t.value >= 4360 && t.value < 5200);
const ok = computed(() => after(t.value, 5200));
const applyClick = computed(() => t.value >= 5900 && t.value < 6160);
const applied = computed(() => after(t.value, 6000) && !after(t.value, 8400));
const exit = computed(() => after(t.value, DURATION - 500));
</script>

<template>
  <DemoWindow app="Word" doc="Q3 report.docx" accent="#2b579a" badge="#2b579a" :exit="exit">
    <template #doc>
      <div class="demo-doc-word demo-dim">
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
        </div>
      </div>
    </template>

    <template #pane>
      <DemoPane :view="view" :show-input="false">
        <Transition name="demo-swap" mode="out-in">
          <div v-if="!settingsOpen" key="welcome" class="demo-welcome">
            <img class="demo-welcome-logo" :src="logoUrl" alt="OpenDocBot" />
            <div class="demo-welcome-text">
              <div class="demo-welcome-title">Bring your own AI</div>
              <p class="demo-welcome-sub">
                Connect OpenDocBot to the AI provider you already use. No sign-up, no intermediary.
              </p>
            </div>
            <button type="button" class="demo-welcome-cta" :class="{ click: ctaClick }">
              Connect a provider
            </button>
            <p class="demo-welcome-note">
              Your API key is stored locally and sent directly to the provider.
            </p>
          </div>

          <div v-else key="settings" class="demo-settings">
            <div class="demo-tabs">
              <span class="demo-tab on">Connection</span>
              <span class="demo-tab">Behavior</span>
            </div>

            <div class="demo-field">
              <span class="demo-label">Preset</span>
              <div class="demo-select"><span>OpenAI</span><span class="chev">▾</span></div>
            </div>

            <div class="demo-field">
              <span class="demo-label">Endpoint URL</span>
              <div class="demo-field-input">
                <span class="demo-ellipsis">https://api.openai.com/v1</span>
              </div>
            </div>

            <div class="demo-field">
              <span class="demo-label">API Key</span>
              <div class="demo-field-input">
                <span class="demo-dots">{{ keyDots }}</span>
                <span v-if="typingKey" class="demo-typing-caret" />
                <span v-if="!keyDots" class="demo-ph">sk-...</span>
              </div>
            </div>

            <div class="demo-field">
              <span class="demo-label">Model</span>
              <div class="demo-select"><span>gpt-5.6-luna</span><span class="chev">▾</span></div>
            </div>

            <div class="demo-sep" />

            <div class="demo-advanced">
              <span><span class="demo-tri">▸</span> Advanced</span>
              <span class="chev">▾</span>
            </div>

            <div class="demo-sep" />

            <div class="demo-test-row">
              <span class="demo-test" :class="{ click: testClick, ok }">
                <span v-if="testing" class="demo-spinner" />
                <span>Test Connection</span>
              </span>
              <span v-if="ok" class="demo-connected">Connected (312ms)</span>
            </div>

            <div class="demo-actions">
              <span class="demo-clean">Clean</span>
              <span class="demo-apply" :class="{ click: applyClick }">
                {{ applied ? "Applied!" : "Apply" }}
              </span>
            </div>
          </div>
        </Transition>
      </DemoPane>
    </template>
  </DemoWindow>
</template>
