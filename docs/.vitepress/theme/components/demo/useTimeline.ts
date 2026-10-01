import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** A tiny rAF clock. Scenes derive every visual state from `t` (ms elapsed in the loop). */
export interface TimelineOptions {
  /** Full loop length in milliseconds. */
  duration: number;
  /** Shared play/pause switch (viewport, tab visibility, reduced motion). */
  playing: Ref<boolean>;
  /** Time to freeze on for the static (reduced-motion) frame. */
  initial?: number;
  /** Loop forever (default true). */
  loop?: boolean;
}

/** Playback speed. 0.5 = half speed, so every scene lasts twice as long. */
const SPEED = 0.5;

export function useTimeline(opts: TimelineOptions) {
  const t = ref(opts.initial ?? 0);
  const loop = opts.loop ?? true;
  let raf = 0;
  let last = 0;

  function tick(now: number) {
    raf = requestAnimationFrame(tick);
    if (!opts.playing.value) {
      last = now;
      return;
    }
    let dt = now - last;
    last = now;
    // The tab may have been backgrounded; never jump more than a frame.
    if (dt > 100) dt = 100;
    let next = t.value + dt * SPEED;
    if (next >= opts.duration) {
      next = loop ? next % opts.duration : opts.duration;
    }
    t.value = next;
  }

  onMounted(() => {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  });
  onBeforeUnmount(() => cancelAnimationFrame(raf));

  return { t };
}

/** Characters of `text` revealed between `start` and `end` (ms). */
export function typed(text: string, t: number, start: number, end: number): string {
  if (t <= start) return "";
  if (t >= end) return text;
  const p = (t - start) / (end - start);
  return text.slice(0, Math.round(p * text.length));
}

export function after(t: number, at: number): boolean {
  return t >= at;
}

export function between(t: number, a: number, b: number): boolean {
  return t >= a && t < b;
}
