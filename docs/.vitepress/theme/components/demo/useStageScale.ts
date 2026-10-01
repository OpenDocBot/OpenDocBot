import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/**
 * Fits a fixed-size design stage into a responsive frame using CSS `zoom`
 * (re-lays-out, so text stays crisp at any width — unlike transform scale).
 */
export function useStageScale(el: Ref<HTMLElement | null>, designWidth: number) {
  const scale = ref(1);
  let ro: ResizeObserver | null = null;

  function measure() {
    const w = el.value?.clientWidth ?? 0;
    if (w > 0) scale.value = w / designWidth;
  }

  onMounted(() => {
    ro = new ResizeObserver(measure);
    watch(
      el,
      (node) => {
        ro?.disconnect();
        if (node) {
          ro?.observe(node);
          measure();
        }
      },
      { immediate: true, flush: "post" },
    );
  });
  onBeforeUnmount(() => ro?.disconnect());

  return { scale };
}
