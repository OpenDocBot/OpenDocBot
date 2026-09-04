import { defineConfig } from "vitepress";

// GitHub Pages project sites are served under `/<repo>/`. The deploy workflow
// sets VITEPRESS_BASE from the repo name; local preview uses the root path.
const base = process.env.VITEPRESS_BASE || "/";

export default defineConfig({
  title: "OpenDocBot",
  description: "Open-source AI assistant for Microsoft Office. Bring your own LLM.",
  lang: "en-US",
  base,
  cleanUrls: true,
  // Dark mode only: no light/dark switcher.
  appearance: "force-dark",
  head: [
    ["link", { rel: "icon", href: `${base}favicon.svg` }],
    ["meta", { name: "theme-color", content: "#0f0f0f" }],
    ["meta", { name: "robots", content: "index, follow" }],
  ],

  transformHead({ pageData }) {
    const rel = pageData.relativePath;
    if (!rel || rel === "404.md" || rel === "README.md") return;
    const path = (
      "/" +
      rel.replace(/\.md$/, "").replace(/(^|\/)index$/, "$1")
    ).replace(/\/{2,}/g, "/");
    const host = "https://opendocbot.com";
    return [["link", { rel: "canonical", href: `${host}${path}` }]];
  },

  themeConfig: {
    logo: "/logo-mark.svg",
    // Hide the "OpenDocBot" title text next to the nav logo (mark only).
    siteTitle: false,
    nav: [
      { text: "Docs", link: "/docs/quickstart" },
      { text: "Providers", link: "/docs/providers/" },
      { text: "Features", link: "/docs/features" },
      { text: "GitHub", link: "https://github.com/opendocbot/opendocbot" },
    ],

    sidebar: [
      {
        text: "Docs",
        items: [
          { text: "Quickstart", link: "/docs/quickstart" },
          { text: "Compatibility", link: "/docs/compatibility" },
          { text: "Configuration", link: "/docs/configuration" },
          {
            text: "Providers",
            link: "/docs/providers/",
            collapsed: false,
            items: [
              { text: "OpenAI", link: "/docs/providers/openai" },
              { text: "Anthropic Claude", link: "/docs/providers/anthropic" },
              { text: "Google Gemini", link: "/docs/providers/gemini" },
              { text: "DeepSeek", link: "/docs/providers/deepseek" },
              { text: "Ollama", link: "/docs/providers/ollama" },
              { text: "OpenRouter", link: "/docs/providers/openrouter" },
              { text: "Custom (any provider)", link: "/docs/providers/custom" },
              { text: "OpenCode", link: "/docs/providers/opencode" },
            ],
          },
          { text: "Self-hosting", link: "/docs/selfhosting" },
          { text: "Features", link: "/docs/features" },
          { text: "Troubleshooting", link: "/docs/troubleshooting" },
        ],
      },
    ],

    outline: { label: "On this page", level: [2, 3, 4] },
    search: {
      provider: "local",
      options: {
        translations: {
          button: { buttonText: "Search docs", buttonAriaLabel: "Search docs" },
        },
      },
    },

    docFooter: { prev: "Previous", next: "Next" },

    returnToTopLabel: "Back to top",
    sidebarMenuLabel: "Menu",
  },

  markdown: {
    theme: "vitesse-dark",
    lineNumbers: true,
  },
});
