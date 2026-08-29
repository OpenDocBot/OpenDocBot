#!/usr/bin/env node
/**
 * Generate a production manifest.xml for a hosted instance.
 *
 * Reads the deployment URL from OPENDOCBOT_URL (or derives the GitHub Pages
 * URL from the repo) and writes it to dist/manifest.xml, replacing the localhost
 * dev manifest.
 *
 * Usage:
 *   OPENDOCBOT_URL=https://addin.example.com node scripts/build-manifest.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));

function deriveGithubPagesUrl() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return null;
  const owner = repo.split("/")[0];
  const name = repo.split("/")[1]?.toLowerCase();
  if (!owner || !name) return null;
  return `https://${owner}.github.io/${name}`;
}

const baseUrl = (
  process.env.OPENDOCBOT_URL ||
  deriveGithubPagesUrl() ||
  ""
).replace(/\/+$/, "");

// Optional sub-path the add-in is served under (e.g. "/app"). Empty by default
// so the app lives at the site root.
const appPath = (process.env.OPENDOCBOT_APP_PATH || "").replace(/\/+$/, "");

if (!baseUrl) {
  console.error(
    "OPENDOCBOT_URL is required (or set GITHUB_REPOSITORY to derive the GitHub Pages URL)."
  );
  process.exit(1);
}

const distDir = path.join(root, "dist");
const version = process.env.OPENDOCBOT_VERSION || "1.0.0.0";

const manifest = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<OfficeApp
  xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
  xsi:type="TaskPaneApp">

  <Id>d5a7b2c1-9f4e-4a3d-8b6c-1e2f3a4b5c6d</Id>
  <Version>${version}</Version>
  <ProviderName>OpenDocBot</ProviderName>
  <DefaultLocale>en-US</DefaultLocale>
  <DisplayName DefaultValue="OpenDocBot"/>
  <Description DefaultValue="Open-source AI assistant for Microsoft Office"/>

  <IconUrl DefaultValue="${baseUrl}${appPath}/assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="${baseUrl}${appPath}/assets/icon-64.png"/>
  <SupportUrl DefaultValue="https://opendocbot.com/support"/>

  <Hosts>
    <Host Name="Document"/>
    <Host Name="Workbook"/>
    <Host Name="Presentation"/>
  </Hosts>

  <Requirements>
    <Sets DefaultMinVersion="1.1">
      <Set Name="SharedRuntime" MinVersion="1.1"/>
    </Sets>
  </Requirements>

  <DefaultSettings>
    <SourceLocation DefaultValue="${baseUrl}${appPath}/index.html?v=${version}"/>
  </DefaultSettings>

  <Permissions>ReadWriteDocument</Permissions>

</OfficeApp>
`;

const distExists = fs.existsSync(distDir);
if (!distExists) {
  console.error("dist/ not found — run npm run build first.");
  process.exit(1);
}

fs.writeFileSync(path.join(distDir, "manifest.xml"), manifest);
console.log(`[build-manifest] wrote dist/manifest.xml → ${baseUrl}`);
