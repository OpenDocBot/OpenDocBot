<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from "vue";
import { withBase } from "vitepress";

const YOUTUBE_ID = "BLD9L21JnNc";
const playing = ref(false);
const poster = withBase("/promo-thumbnail.jpg");
const mountEl = ref<HTMLDivElement | null>(null);

let player: any = null;
let apiPromise: Promise<void> | null = null;

// Load the YouTube IFrame API on demand (only after the user clicks), so no
// YouTube request happens on page load.
function loadApi(): Promise<void> {
  const w = window as any;
  if (w.YT && w.YT.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<void>((resolve) => {
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      if (typeof previous === "function") previous();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(s);
  });
  return apiPromise;
}

watch(
  playing,
  async (on) => {
    if (!on || !mountEl.value) return;
    await loadApi();
    const YT = (window as any).YT;
    player = new YT.Player(mountEl.value, {
      videoId: YOUTUBE_ID,
      playerVars: {
        host: "https://www.youtube-nocookie.com",
        autoplay: 1,
        mute: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        iv_load_policy: 3,
        playsinline: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: (e: any) => {
          // Start muted so autoplay is guaranteed (controls then auto-hide).
          e.target.mute?.();
          e.target.playVideo?.();
        },
        onStateChange: (e: any) => {
          // Once playing, restore sound (allowed because the user clicked).
          if (e.data === 1) {
            try {
              e.target.unMute?.();
              e.target.setVolume?.(100);
            } catch {
              /* stays muted if the browser blocks it */
            }
          }
        },
      },
    });
  },
  { flush: "post" },
);

onBeforeUnmount(() => {
  try {
    player?.destroy?.();
  } catch {
    /* noop */
  }
});
</script>

<template>
  <div class="hero-video">
    <button
      v-if="!playing"
      type="button"
      class="hero-video-facade"
      aria-label="Play the OpenDocBot demo video"
      @click="playing = true"
    >
      <img :src="poster" alt="OpenDocBot demo" loading="lazy" />
      <span class="hero-video-play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>
      </span>
    </button>
    <div v-else ref="mountEl" class="hero-video-player"></div>
  </div>
</template>
