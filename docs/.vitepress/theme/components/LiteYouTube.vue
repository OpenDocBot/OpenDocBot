<script setup lang="ts">
import { computed, ref } from "vue";
import { withBase } from "vitepress";

const props = defineProps<{
  /** YouTube video id (the part after `v=` or `/embed/`). */
  id: string;
  /** Accessible title and caption shown on the facade. */
  title: string;
  /** Optional locally hosted poster image. When omitted, a neutral facade is used. */
  poster?: string;
}>();

const playing = ref(false);
const logo = withBase("/logo-mark.svg");

// Nothing is requested from YouTube until the user clicks: no embed, no
// iframe, no thumbnail. Only then do we swap in the privacy-enhanced player.
const embedSrc = computed(
  () =>
    `https://www.youtube-nocookie.com/embed/${props.id}` +
    "?autoplay=1&rel=0&modestbranding=1&playsinline=1",
);
const posterSrc = computed(() => (props.poster ? withBase(props.poster) : ""));
</script>

<template>
  <div class="lite-yt">
    <button
      v-if="!playing"
      type="button"
      class="lite-yt-facade"
      :aria-label="`Play: ${title}`"
      @click="playing = true"
    >
      <img v-if="posterSrc" class="lite-yt-poster" :src="posterSrc" :alt="title" loading="lazy" />
      <span v-else class="lite-yt-placeholder" aria-hidden="true">
        <img class="lite-yt-logo" :src="logo" alt="" />
      </span>
      <span class="lite-yt-play" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5z" fill="currentColor" /></svg>
      </span>
      <span class="lite-yt-caption">{{ title }}</span>
    </button>
    <iframe
      v-else
      :src="embedSrc"
      :title="title"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowfullscreen
    ></iframe>
  </div>
</template>

<style scoped>
.lite-yt {
  position: relative;
  width: 100%;
  max-width: 100%;
  aspect-ratio: 16 / 9;
  margin: 16px 0;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}
.lite-yt iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}
.lite-yt-facade {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.lite-yt-poster {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.lite-yt-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 50% 40%, rgba(61, 220, 132, 0.1), transparent 55%),
    linear-gradient(135deg, #0f120f 0%, #0b0d0b 60%, #0a0f0b 100%);
}
.lite-yt-logo {
  width: 30%;
  max-width: 180px;
  opacity: 0.35;
}
.lite-yt-play {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lite-yt-play svg {
  width: 72px;
  height: 72px;
  padding: 14px;
  border-radius: 50%;
  color: #04120a;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 24px rgba(61, 220, 132, 0.55);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.lite-yt-facade:hover .lite-yt-play svg {
  transform: scale(1.06);
  box-shadow: 0 0 34px rgba(61, 220, 132, 0.8);
}
.lite-yt-facade:focus-visible .lite-yt-play svg {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 4px;
}
.lite-yt-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 8px 12px;
  font-size: 0.8rem;
  text-align: left;
  color: var(--vp-c-text-2);
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72), transparent);
}
</style>
