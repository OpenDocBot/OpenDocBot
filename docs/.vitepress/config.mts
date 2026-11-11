import { defineConfig } from "vitepress";

// GitHub Pages project sites are served under `/<repo>/`. The deploy workflow
// sets VITEPRESS_BASE from the repo name; local preview uses the root path.
const base = process.env.VITEPRESS_BASE || "/";

const sitemapPriorities: Record<string, number> = {
  "/": 1,
  "/enterprise": 0.9,
  "/docs/quickstart": 0.9,
  "/docs/compatibility": 0.8,
  "/docs/configuration": 0.8,
  "/docs/providers/": 0.8,
  "/docs/features": 0.7,
  "/docs/selfhosting": 0.7,
  "/docs/license": 0.3,
  "/privacy": 0.3,
  "/terms": 0.3,
  "/support": 0.3,
};

function sitemapPath(url: string) {
  return "/" + url.replace(/^\/+/, "");
}

export default defineConfig({
  title: "OpenDocBot",
  description: "Self-hostable AI assistant for Microsoft Office. Bring your own LLM.",
  lang: "en-US",
  base,
  cleanUrls: true,
  srcExclude: ["README.md"],
  sitemap: {
    hostname: "https://opendocbot.com",
    transformItems(items) {
      return items
        .filter((item) => {
          const path = sitemapPath(item.url);
          return path !== "/README" && path !== "/404";
        })
        .map((item) => {
          const path = sitemapPath(item.url);
          return {
            ...item,
            priority:
              sitemapPriorities[path] ??
              (path.startsWith("/docs/providers/") ? 0.7 : 0.6),
          };
        });
    },
  },
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
    const url = `${host}${path}`;
    const frontmatter = pageData.frontmatter ?? {};
    const imagePath =
      typeof frontmatter.ogImage === "string" ? frontmatter.ogImage : "/og-image.png";
    const image = imagePath.startsWith("http") ? imagePath : `${host}${imagePath}`;
    const imageAlt =
      typeof frontmatter.ogImageAlt === "string"
        ? frontmatter.ogImageAlt
        : "OpenDocBot - the trustable Office AI agent";
    const isHome = rel === "index.md" || rel === "";
    const isBlogPost = rel.startsWith("blog/") && rel !== "blog/index.md";
    const title = isHome
      ? "The Office AI agent you can actually trust"
      : pageData.title;
    const description = pageData.description;

    const head: any[] = [
      ["link", { rel: "canonical", href: url }],
      ["meta", { property: "og:type", content: isBlogPost ? "article" : "website" }],
      ["meta", { property: "og:site_name", content: "OpenDocBot" }],
      ["meta", { property: "og:locale", content: "en_US" }],
      ["meta", { property: "og:url", content: url }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:image", content: image }],
      ["meta", { property: "og:image:type", content: "image/png" }],
      ["meta", { property: "og:image:width", content: "1200" }],
      ["meta", { property: "og:image:height", content: "630" }],
      ["meta", { property: "og:image:alt", content: imageAlt }],
      ["meta", { name: "twitter:card", content: "summary_large_image" }],
      ["meta", { name: "twitter:title", content: title }],
      ["meta", { name: "twitter:description", content: description }],
      ["meta", { name: "twitter:image", content: image }],
    ];

    if (isBlogPost) {
      const published =
        typeof frontmatter.date === "string" ? frontmatter.date : undefined;

      if (published) {
        head.push(["meta", { property: "article:published_time", content: published }]);
        head.push(["meta", { property: "article:author", content: "OpenDocBot" }]);
      }

      const jsonLd: Record<string, unknown> = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: title,
        description,
        image,
        url,
        mainEntityOfPage: { "@type": "WebPage", "@id": url },
        author: { "@type": "Organization", name: "OpenDocBot", url: host },
        publisher: {
          "@type": "Organization",
          name: "OpenDocBot",
          url: host,
          logo: { "@type": "ImageObject", url: `${host}/logo.svg` },
        },
      };

      if (published) {
        jsonLd.datePublished = published;
        jsonLd.dateModified = published;
      }

      head.push(["script", { type: "application/ld+json" }, JSON.stringify(jsonLd)]);
    }

    return head;
  },

  themeConfig: {
    logo: "/logo-mark.svg",
    // Hide the "OpenDocBot" title text next to the nav logo (mark only).
    siteTitle: false,
    nav: [
      { text: "Docs", link: "/docs/quickstart" },
      { text: "Blog", link: "/blog/" },
      { text: "Enterprise", link: "/enterprise" },
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
              { text: "Amazon Bedrock", link: "/docs/providers/bedrock" },
              { text: "Microsoft Foundry", link: "/docs/providers/foundry" },
              { text: "Ollama", link: "/docs/providers/ollama" },
              { text: "OpenRouter", link: "/docs/providers/openrouter" },
              { text: "Custom (any provider)", link: "/docs/providers/custom" },
              { text: "OpenCode", link: "/docs/providers/opencode" },
            ],
          },
          { text: "Self-hosting", link: "/docs/selfhosting" },
          {
            text: "Team Features",
            collapsed: false,
            items: [
              {
                text: "Single Sign-On",
                link: "/docs/enterprise/sso",
                collapsed: false,
                items: [
                  { text: "Microsoft Entra ID", link: "/docs/enterprise/entra-id" },
                ],
              },
              {
                text: "Managed configuration",
                link: "/docs/enterprise/managed-configuration",
              },
            ],
          },
          { text: "Features", link: "/docs/features" },
          { text: "Skills", link: "/docs/skills" },
          { text: "MCP", link: "/docs/mcp" },
          { text: "Troubleshooting", link: "/docs/troubleshooting" },
          { text: "License", link: "/docs/license" },
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
