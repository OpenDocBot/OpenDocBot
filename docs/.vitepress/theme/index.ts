import DefaultTheme from "vitepress/theme";
import { h } from "vue";
import { withBase } from "vitepress";
import type { Theme } from "vitepress";
import Tabs from "./components/Tabs.vue";
import Tab from "./components/Tab.vue";
import HeroDemo from "./components/demo/HeroDemo.vue";
import LiteYouTube from "./components/LiteYouTube.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component("Tabs", Tabs);
    app.component("Tab", Tab);
    // Click-to-play YouTube facade: no request to Google until the user clicks.
    app.component("LiteYouTube", LiteYouTube);
  },
  Layout() {
    return h(DefaultTheme.Layout, null, {
      // The wordmark sits at the top of the hero info column, directly
      // above the "Free the Office AI ecosystem" text (replacing the name).
      "home-hero-info-before": () =>
        h("div", { class: "home-hero-logo" }, [
          h("img", { src: withBase("/logo.svg"), alt: "OpenDocBot", class: "home-hero-logo-img" }),
        ]),
      // Self-running product demo, placed below the hero buttons and above the
      // features. Scripted DOM/CSS recreation of the taskpane — no video, no
      // iframe, no network. Scenario buttons switch the animated scene.
      "home-hero-after": () =>
        h("div", { class: "home-hero-demo-wrap" }, [h(HeroDemo)]),
      // Legal links bar rendered at the very bottom of every page (the default
      // VPFooter is hidden on sidebar pages).
      "layout-bottom": () =>
        h("div", { class: "vp-legal-bar" }, [
          h("span", "© 2026 OpenDocBot"),
          h("span", { class: "vp-legal-sep" }, "·"),
          h("a", { href: withBase("/support") }, "Support"),
          h("span", { class: "vp-legal-sep" }, "·"),
          h("a", { href: withBase("/privacy") }, "Privacy Policy"),
          h("span", { class: "vp-legal-sep" }, "·"),
          h("a", { href: withBase("/terms") }, "Terms of Use"),
        ]),
    });
  },
} satisfies Theme;