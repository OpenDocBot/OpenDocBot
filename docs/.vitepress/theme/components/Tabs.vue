<script setup lang="ts">
import { computed, ref, useSlots } from "vue";

const slots = useSlots();

const tabs = computed(() => {
  const kids = slots.default?.() ?? [];
  return kids.map((vnode, i) => ({
    label: (vnode.props?.label as string) ?? `Tab ${i + 1}`,
    vnode,
  }));
});

const active = ref(0);
</script>

<template>
  <div class="vp-tabs">
    <div class="vp-tabs-nav" role="tablist">
      <button
        v-for="(tab, i) in tabs"
        :key="i"
        type="button"
        role="tab"
        :aria-selected="active === i"
        :class="{ active: active === i }"
        @click="active = i"
      >
        {{ tab.label }}
      </button>
    </div>
    <div class="vp-tabs-panels">
      <div
        v-for="(tab, i) in tabs"
        v-show="active === i"
        :key="i"
        role="tabpanel"
      >
        <component :is="tab.vnode" />
      </div>
    </div>
  </div>
</template>